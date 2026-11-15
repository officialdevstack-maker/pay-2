import 'server-only';
import { eq } from 'drizzle-orm';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { db } from '@/server/db/client';
import { checkoutTransfers } from '@/server/db/schema';
import { getProvider, isBrandSafe, mapProviderError } from '@/server/providers';
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

export async function startBankTransfer(sessionId: string): Promise<TransferDetails> {
  const found = await getSessionForCheckout(sessionId);
  if (!found) throw new AppError('CHECKOUT_NOT_FOUND', 'We could not find that checkout session.', 404);

  const { session, merchant } = found;
  if (effectiveStatus(session) !== 'open') {
    throw new AppError('CHECKOUT_UNAVAILABLE', 'This checkout is no longer available.', 409);
  }

  const existing = await getTransferDetails(session.id);
  if (existing) return existing;

  let account;
  try {
    account = await (await getProvider()).createCheckoutAccount({
      reference: session.reference,
      amount: session.amount,
      name: `Spurs Pay ${merchant.name}`.slice(0, 40),
      expiresAt: session.expiresAt,
    });
  } catch (error) {
    throw mapProviderError(error);
  }

  if (!isBrandSafe(account.bankName) || !isBrandSafe(account.accountName)) {
    logger.error('transfer account refused: vendor name in display fields', { session: session.reference });
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
