import 'server-only';
import { asc, eq } from 'drizzle-orm';
import { db, type Tx } from '@/server/db/client';
import { checkoutSessions, ledgerEntries, merchants, transactions } from '@/server/db/schema';
import { isUniqueViolation } from '@/lib/db-errors';
import { AppError } from '@/lib/errors';
import { enqueueMerchantWebhook } from '@/modules/merchant-webhooks';
import { post } from './post';
import type { PostedTransaction } from './types';

export interface ReverseInput {
  transactionId: string;
  idempotency: { scope: string; key: string };
  reason?: string;
}

/** Posts mirrored entries linked to the original. One reversal per transaction, enforced by a unique index. */
export function reverse(input: ReverseInput, tx?: Tx): Promise<PostedTransaction> {
  return tx ? run(tx, input) : db.transaction((inner) => run(inner, input));
}

async function run(tx: Tx, input: ReverseInput): Promise<PostedTransaction> {
  const [original] = await tx.select().from(transactions).where(eq(transactions.id, input.transactionId)).limit(1);
  if (!original) throw new AppError('NOT_FOUND', 'Transaction not found.', 404);
  if (original.reversesTransactionId) {
    throw new AppError('LEDGER_INVALID', 'A reversal cannot itself be reversed.', 422);
  }
  if (original.currency !== 'NGN') {
    throw new AppError('CURRENCY_MISMATCH', 'The transaction currency is not supported.', 422);
  }

  const entries = await tx
    .select()
    .from(ledgerEntries)
    .where(eq(ledgerEntries.transactionId, original.id))
    .orderBy(asc(ledgerEntries.id));

  try {
    const reversal = await post(
      {
        type: 'reversal',
        currency: original.currency,
        idempotency: input.idempotency,
        reversesTransactionId: original.id,
        metadata: { original: original.reference, reason: input.reason ?? null },
        entries: entries.map((e) => ({
          accountId: e.accountId,
          direction: e.direction === 'debit' ? 'credit' : 'debit',
          amount: e.amount,
        })),
      },
      tx,
    );
    const [checkout] = await tx
      .select({
        session: checkoutSessions,
        merchant: merchants,
      })
      .from(checkoutSessions)
      .innerJoin(merchants, eq(merchants.id, checkoutSessions.merchantId))
      .where(eq(checkoutSessions.transactionId, original.id))
      .limit(1);
    if (checkout) {
      await enqueueMerchantWebhook(tx, {
        merchantId: checkout.merchant.id,
        eventType: 'payment.reversed',
        eventKey: `payment.reversed:${reversal.id}`,
        payload: {
          id: `payment.reversed:${reversal.id}`,
          type: 'payment.reversed',
          createdAt: reversal.createdAt.toISOString(),
          data: {
            merchantId: checkout.merchant.id,
            merchantName: checkout.merchant.name,
            checkoutReference: checkout.session.reference,
            merchantReference: checkout.session.merchantReference,
            transactionReference: reversal.reference,
            originalTransactionReference: original.reference,
            amount: checkout.session.amount.toString(),
            currency: checkout.session.currency,
            reversedAt: reversal.createdAt.toISOString(),
            reason: input.reason ?? null,
          },
        },
      });
    }
    return reversal;
  } catch (error) {
    if (isUniqueViolation(error, 'transactions_reverses_uq')) {
      throw new AppError('ALREADY_REVERSED', 'This transaction was already reversed.', 409);
    }
    throw error;
  }
}
