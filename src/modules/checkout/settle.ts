import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import { AppError } from '@/lib/errors';
import { post, systemAccountId } from '@/modules/ledger';
import { db, type Tx } from '@/server/db/client';
import { checkoutAttempts, checkoutSessions, merchants } from '@/server/db/schema';
import { enqueueMerchantWebhook } from '@/modules/merchant-webhooks';
import type { CheckoutMethod } from './attempts';

export async function settleSession(
  sessionId: string,
  idempotencyKey: string,
  tx?: Tx,
  method: CheckoutMethod = 'bank_transfer',
): Promise<{ reference: string; replayed: boolean }> {
  return tx
    ? run(tx, sessionId, idempotencyKey, method)
    : db.transaction((inner) => run(inner, sessionId, idempotencyKey, method));
}

async function run(tx: Tx, sessionId: string, idempotencyKey: string, method: CheckoutMethod) {
  const [session] = await tx
    .select()
    .from(checkoutSessions)
    .where(eq(checkoutSessions.id, sessionId))
    .for('update')
    .limit(1);
  if (!session) throw new AppError('CHECKOUT_NOT_FOUND', 'We could not find that checkout session.', 404);
  if (session.status === 'paid') return { reference: session.reference, replayed: true };
  if (session.status === 'cancelled') {
    throw new AppError('CHECKOUT_CANCELLED', 'This checkout was cancelled.', 409);
  }
  if (session.status === 'expired') {
    throw new AppError('CHECKOUT_EXPIRED', 'This checkout has expired.', 409);
  }
  if (session.expiresAt <= new Date()) {
    const [activeAttempt] = await tx
      .select({ id: checkoutAttempts.id })
      .from(checkoutAttempts)
      .where(
        and(
          eq(checkoutAttempts.sessionId, session.id),
          eq(checkoutAttempts.method, method),
          inArray(checkoutAttempts.status, ['pending', 'unknown']),
        ),
      )
      .limit(1);
    if (!activeAttempt) {
      throw new AppError('CHECKOUT_EXPIRED', 'This checkout has expired.', 409);
    }
  }

  const [merchant] = await tx.select().from(merchants).where(eq(merchants.id, session.merchantId)).limit(1);
  if (!merchant) throw new AppError('INTERNAL', 'Merchant missing.');

  const posted = await post(
    {
      type: 'payment',
      idempotency: { scope: `checkout:${session.id}`, key: idempotencyKey },
      entries: [
        { accountId: await systemAccountId('provider_clearing', tx), direction: 'debit', amount: session.amount },
        { accountId: merchant.ledgerAccountId, direction: 'credit', amount: session.amount },
      ],
      metadata: { session: session.reference, merchant: merchant.id, merchantReference: session.merchantReference },
    },
    tx,
  );

  const paidAt = new Date();
  await tx
    .update(checkoutSessions)
    .set({ status: 'paid', transactionId: posted.id, paidAt })
    .where(eq(checkoutSessions.id, session.id));

  await enqueueMerchantWebhook(tx, {
    merchantId: merchant.id,
    eventType: 'payment.succeeded',
    eventKey: `payment.succeeded:${session.id}`,
    payload: {
      id: `payment.succeeded:${session.id}`,
      type: 'payment.succeeded',
      createdAt: paidAt.toISOString(),
      data: {
        merchantId: merchant.id,
        merchantName: merchant.name,
        checkoutReference: session.reference,
        merchantReference: session.merchantReference,
        transactionReference: posted.reference,
        amount: session.amount.toString(),
        currency: session.currency,
        paidAt: paidAt.toISOString(),
      },
    },
  });

  return { reference: session.reference, replayed: false };
}
