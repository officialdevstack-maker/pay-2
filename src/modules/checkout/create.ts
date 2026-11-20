import 'server-only';
import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { AppError } from '@/lib/errors';
import { newReference } from '@/lib/ids';
import { db } from '@/server/db/client';
import { checkoutSessions, merchants } from '@/server/db/schema';
import { getPayPolicyConfig } from '@/server/admin-config';
import type { CheckoutSession, CreateSessionInput, Merchant } from './types';

export async function findMerchantByClient(clientId: string): Promise<Merchant> {
  const [merchant] = await db.select().from(merchants).where(eq(merchants.clientId, clientId)).limit(1);
  if (!merchant) throw new AppError('MERCHANT_NOT_FOUND', 'This client is not set up for checkout.', 403);
  if (merchant.status !== 'active') {
    throw new AppError('MERCHANT_UNAVAILABLE', 'This merchant cannot take payments right now.', 403);
  }
  return merchant;
}

const hashOf = (input: CreateSessionInput) =>
  createHash('sha256')
    .update(JSON.stringify([input.amount.toString(), input.merchantReference, input.description]))
    .digest('hex');

export async function createSession(
  merchant: Merchant,
  input: CreateSessionInput,
): Promise<{ session: CheckoutSession; replayed: boolean }> {
  const requestHash = hashOf(input);
  const { checkout } = await getPayPolicyConfig();

  const [created] = await db
    .insert(checkoutSessions)
    .values({
      reference: newReference(),
      merchantId: merchant.id,
      merchantReference: input.merchantReference,
      description: input.description,
      amount: input.amount,
      idempotencyKey: input.idempotencyKey,
      requestHash,
      expiresAt: new Date(Date.now() + checkout.sessionTtlSeconds * 1000),
    })
    .onConflictDoNothing({ target: [checkoutSessions.merchantId, checkoutSessions.idempotencyKey] })
    .returning();
  if (created) return { session: created, replayed: false };

  const [existing] = await db
    .select()
    .from(checkoutSessions)
    .where(and(eq(checkoutSessions.merchantId, merchant.id), eq(checkoutSessions.idempotencyKey, input.idempotencyKey)))
    .limit(1);
  if (!existing || existing.requestHash !== requestHash) {
    throw new AppError('IDEMPOTENCY_MISMATCH', 'This request key was already used for a different request.', 409);
  }
  return { session: existing, replayed: true };
}
