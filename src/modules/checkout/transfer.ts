import 'server-only';
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { db } from '@/server/db/client';
import { checkoutTransfers } from '@/server/db/schema';
import { getProvider, isBrandSafe, mapProviderError, ProviderError } from '@/server/providers';
import { beginCheckoutAttempt, resolveCheckoutAttempt } from './attempts';
import { effectiveStatus, getSessionForCheckout } from './view';

export interface TransferDetails {
  bankName: string;
  accountName: string;
  accountNumber: string;
}

export async function getTransferDetails(sessionId: string): Promise<TransferDetails | null> {
  const [row] = await db
    .select({
      bankName: checkoutTransfers.bankName,
      accountName: checkoutTransfers.accountName,
      accountNumber: checkoutTransfers.accountNumber,
    })
    .from(checkoutTransfers)
    .where(eq(checkoutTransfers.sessionId, sessionId))
    .limit(1);
  return row ?? null;
}

export async function startBankTransfer(
  sessionId: string,
  userId: string,
  idempotencyKey: string,
): Promise<TransferDetails> {
  const found = await getSessionForCheckout(sessionId, userId);
  if (!found) throw new AppError('CHECKOUT_NOT_FOUND', 'We could not find that checkout session.', 404);

  const { session, merchant } = found;
  if (effectiveStatus(session) !== 'open') {
    throw new AppError('CHECKOUT_UNAVAILABLE', 'This checkout is no longer available.', 409);
  }

  const { attempt, replayed } = await beginCheckoutAttempt({
    sessionId: session.id,
    userId,
    method: 'bank_transfer',
    idempotencyKey,
    requestHash: createHash('sha256').update(`bank_transfer:${session.id}`).digest('hex'),
  });

  const existing = await getTransferDetails(session.id);
  if (existing) return existing;
  if (replayed) {
    if (attempt.status === 'failed') {
      throw new AppError('CHECKOUT_PAYMENT_FAILED', 'This payment attempt could not be completed. Start a new attempt.', 422);
    }
    throw new AppError(
      attempt.status === 'unknown' ? 'CHECKOUT_ATTEMPT_UNKNOWN' : 'CHECKOUT_ATTEMPT_IN_PROGRESS',
      'We could not confirm the transfer instructions yet. Check this checkout again before retrying.',
      409,
    );
  }

  let account;
  try {
    account = await (await getProvider()).createCheckoutAccount({
      reference: session.reference,
      amount: session.amount,
      name: `Spurs Pay ${merchant.name}`.slice(0, 40),
      expiresAt: session.expiresAt,
    });
  } catch (error) {
    const unknown =
      error instanceof ProviderError && ['TIMEOUT', 'UNAVAILABLE', 'UNKNOWN'].includes(error.kind);
    await resolveCheckoutAttempt(attempt.id, {
      status: unknown ? 'unknown' : 'failed',
      failureCode: error instanceof ProviderError ? error.kind : 'PROVIDER_REQUEST_FAILED',
    });
    throw mapProviderError(error);
  }

  if (!isBrandSafe(account.bankName) || !isBrandSafe(account.accountName)) {
    logger.error('transfer account refused: vendor name in display fields', { session: session.reference });
    await resolveCheckoutAttempt(attempt.id, { status: 'failed', failureCode: 'UNSAFE_PROVIDER_DISPLAY' });
    throw new AppError('SERVICE_UNAVAILABLE', 'This service is temporarily unavailable. Try again shortly.', 503);
  }

  await db
    .insert(checkoutTransfers)
    .values({
      sessionId: session.id,
      accountNumber: account.accountNumber,
      accountName: account.accountName,
      bankName: account.bankName,
      providerRef: account.providerRef,
    })
    .onConflictDoNothing({ target: checkoutTransfers.sessionId });

  const saved = await getTransferDetails(session.id);
  if (!saved) throw new AppError('INTERNAL', 'Could not save transfer details.');
  return saved;
}
