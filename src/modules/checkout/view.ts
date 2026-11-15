import 'server-only';
import { and, eq } from 'drizzle-orm';
import { env } from '@/env';
import { AppError } from '@/lib/errors';
import { db } from '@/server/db/client';
import { checkoutSessions, merchants } from '@/server/db/schema';
import { SESSION_ID } from './input';
import type { CheckoutSession, Merchant, SessionStatus } from './types';

export function effectiveStatus(session: CheckoutSession, now = new Date()): SessionStatus {
  return session.status === 'open' && session.expiresAt <= now ? 'expired' : session.status;
}

export async function getSessionForCheckout(id: string): Promise<{ session: CheckoutSession; merchant: Merchant } | null> {
  if (!SESSION_ID.test(id)) return null;

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

export function returnHref(session: CheckoutSession, merchant: Merchant): string {
  const url = new URL(merchant.returnUrl);
  url.searchParams.set('reference', session.merchantReference);
  url.searchParams.set('status', effectiveStatus(session));
  return url.toString();
}

export function serializeSession(session: CheckoutSession) {
  return {
    id: session.id,
    reference: session.reference,
    merchantReference: session.merchantReference,
    status: effectiveStatus(session),
    amountKobo: session.amount.toString(),
    currency: 'NGN' as const,
    checkoutUrl: new URL(`/checkout/${session.id}`, env.APP_URL).toString(),
    expiresAt: session.expiresAt.toISOString(),
    paidAt: session.paidAt?.toISOString() ?? null,
  };
}
