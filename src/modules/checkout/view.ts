import 'server-only';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { env } from '@/env';
import { AppError } from '@/lib/errors';
import { db } from '@/server/db/client';
import { checkoutAttempts, checkoutSessions, merchants, transactions } from '@/server/db/schema';
import { SESSION_ID } from './input';
import { deriveCheckoutStatus, type PublicCheckoutStatus } from './status';
import type { CheckoutSession, Merchant } from './types';

export function effectiveStatus(session: CheckoutSession, now = new Date()): PublicCheckoutStatus {
  return deriveCheckoutStatus({
    sessionStatus: session.status,
    expiresAt: session.expiresAt,
    latestAttemptStatus: null,
    reversed: false,
    now,
  });
}

export async function getCheckoutStatus(session: CheckoutSession, now = new Date()): Promise<PublicCheckoutStatus> {
  const [latestAttempt] = await db
    .select({ status: checkoutAttempts.status })
    .from(checkoutAttempts)
    .where(eq(checkoutAttempts.sessionId, session.id))
    .orderBy(desc(checkoutAttempts.createdAt), desc(checkoutAttempts.id))
    .limit(1);

  const [reversal] = session.transactionId
    ? await db
        .select({ id: transactions.id })
        .from(transactions)
        .where(eq(transactions.reversesTransactionId, session.transactionId))
        .limit(1)
    : [];

  return deriveCheckoutStatus({
    sessionStatus: session.status,
    expiresAt: session.expiresAt,
    latestAttemptStatus: latestAttempt?.status ?? null,
    reversed: Boolean(reversal),
    now,
  });
}

export async function getSessionForCheckout(
  id: string,
  userId: string,
): Promise<{ session: CheckoutSession; merchant: Merchant } | null> {
  if (!SESSION_ID.test(id)) return null;

  const [current] = await db
    .select({ userId: checkoutSessions.userId })
    .from(checkoutSessions)
    .where(eq(checkoutSessions.id, id))
    .limit(1);
  if (!current || (current.userId !== null && current.userId !== userId)) return null;

  if (current.userId === null) {
    const [claimed] = await db
      .update(checkoutSessions)
      .set({ userId })
      .where(and(eq(checkoutSessions.id, id), isNull(checkoutSessions.userId)))
      .returning({ id: checkoutSessions.id });
    if (!claimed) {
      const [owner] = await db
        .select({ userId: checkoutSessions.userId })
        .from(checkoutSessions)
        .where(and(eq(checkoutSessions.id, id), eq(checkoutSessions.userId, userId)))
        .limit(1);
      if (!owner) return null;
    }
  }

  const [row] = await db
    .select({ session: checkoutSessions, merchant: merchants })
    .from(checkoutSessions)
    .innerJoin(merchants, eq(merchants.id, checkoutSessions.merchantId))
    .where(eq(checkoutSessions.id, id))
    .limit(1);
  return row ?? null;
}

export async function getSessionForMerchant(merchant: Merchant, id: string): Promise<CheckoutSession> {
  const notFound = () => new AppError('CHECKOUT_NOT_FOUND', 'We could not find that checkout session.', 404);
  if (!SESSION_ID.test(id)) throw notFound();

  const [session] = await db
    .select()
    .from(checkoutSessions)
    .where(and(eq(checkoutSessions.id, id), eq(checkoutSessions.merchantId, merchant.id)))
    .limit(1);
  if (!session) throw notFound();
  return session;
}

export async function getSessionForMerchantByReference(merchant: Merchant, reference: string): Promise<CheckoutSession> {
  const notFound = () => new AppError('CHECKOUT_NOT_FOUND', 'We could not find that checkout session.', 404);
  if (!/^SPY_[A-Z0-9]{16}$/.test(reference)) throw notFound();

  const [session] = await db
    .select()
    .from(checkoutSessions)
    .where(and(eq(checkoutSessions.reference, reference), eq(checkoutSessions.merchantId, merchant.id)))
    .limit(1);
  if (!session) throw notFound();
  return session;
}

export function returnHref(
  session: CheckoutSession,
  merchant: Merchant,
  status = effectiveStatus(session),
): string {
  const url = new URL(merchant.returnUrl);
  url.searchParams.set('reference', session.merchantReference);
  url.searchParams.set('status', status);
  return url.toString();
}

export function serializeSession(
  session: CheckoutSession,
  status: PublicCheckoutStatus = effectiveStatus(session),
) {
  return {
    id: session.id,
    reference: session.reference,
    merchantReference: session.merchantReference,
    status,
    amountKobo: session.amount.toString(),
    currency: 'NGN' as const,
    checkoutUrl: new URL(`/checkout/${session.id}`, env.APP_URL).toString(),
    expiresAt: session.expiresAt.toISOString(),
    paidAt: session.paidAt?.toISOString() ?? null,
  };
}

export function serializeMerchantStatus(session: CheckoutSession, status: PublicCheckoutStatus) {
  return {
    reference: session.reference,
    merchantReference: session.merchantReference,
    status,
    amount: session.amount.toString(),
    currency: session.currency,
    expiresAt: session.expiresAt.toISOString(),
    paidAt: session.paidAt?.toISOString() ?? null,
  };
}
