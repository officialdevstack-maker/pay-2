import 'server-only';
import { sql } from 'drizzle-orm';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { hasClaim, post } from '@/modules/ledger';
import { ensureWallet } from '@/modules/wallet';
import { db, type Tx } from '@/server/db/client';
import { beneficiaries } from '@/server/db/schema';
import { assertCanSend, enforceRate, notifyTransfer, verifyTransactionPin } from './deps';
import { resolveRecipientByTag } from './recipients';
import type { SendInput, SendResult, Sender } from './types';

async function rememberRecipient(tx: Tx, ownerId: string, recipientId: string): Promise<void> {
  await tx
    .insert(beneficiaries)
    .values({ ownerId, recipientId })
    .onConflictDoUpdate({
      target: [beneficiaries.ownerId, beneficiaries.recipientId],
      set: { lastSentAt: new Date(), sendCount: sql`${beneficiaries.sendCount} + 1` },
    });
}

export async function sendMoney(
  sender: Sender,
  input: SendInput,
  options: { ip?: string } = {},
): Promise<SendResult> {
  await enforceRate('send', sender.id, options.ip);
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(input.idempotencyKey)) {
    throw new AppError('BAD_REQUEST', 'A valid Idempotency-Key header is required.', 400);
  }
  if (input.amount <= 0n) throw new AppError('VALIDATION_FAILED', 'Enter an amount above ₦0.', 422);

  const recipient = await resolveRecipientByTag(input.recipientTag);
  if (recipient.userId === sender.id) {
    throw new AppError('SELF_TRANSFER', 'You cannot send money to yourself.', 422);
  }

  await verifyTransactionPin(sender.id, input.pin);
  const [from, to] = await Promise.all([
    ensureWallet(sender.id, 'pay'),
    ensureWallet(recipient.userId, 'pay'),
  ]);
  if (from.status !== 'active') {
    throw new AppError('WALLET_UNAVAILABLE', 'Your wallet is unavailable right now.', 403);
  }
  if (to.status !== 'active') {
    throw new AppError('RECIPIENT_UNAVAILABLE', 'This person cannot receive money right now.', 422);
  }

  const idempotency = { scope: sender.id, key: `p2p:${input.idempotencyKey}` };
  const posted = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${idempotency.scope}), hashtext(${idempotency.key}))`,
    );
    const alreadyApplied = await hasClaim(idempotency.scope, idempotency.key, tx);
    if (!alreadyApplied) {
      await assertCanSend(tx, {
        userId: sender.id,
        recipientUserId: recipient.userId,
        product: 'pay',
        amount: input.amount,
      });
    }

    const result = await post(
      {
        type: 'transfer',
        idempotency,
        entries: [
          { accountId: from.ledgerAccountId, direction: 'debit', amount: input.amount },
          { accountId: to.ledgerAccountId, direction: 'credit', amount: input.amount },
        ],
        metadata: { sender: sender.id, recipient: recipient.userId, note: input.note },
      },
      tx,
    );
    if (!result.replayed) await rememberRecipient(tx, sender.id, recipient.userId);
    return result;
  });

  if (!posted.replayed) {
    try {
      await notifyTransfer({
        reference: posted.reference,
        amount: input.amount,
        senderId: sender.id,
        senderName: sender.name,
        recipientId: recipient.userId,
        recipientName: recipient.name,
      });
    } catch (error) {
      logger.error('transfer notification failed', { reference: posted.reference, error });
    }
  }

  return {
    reference: posted.reference,
    amount: input.amount,
    recipient: { name: recipient.name, tag: recipient.tag },
    note: input.note,
    createdAt: posted.createdAt,
    replayed: posted.replayed,
  };
}
