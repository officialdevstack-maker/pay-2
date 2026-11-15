import 'server-only';
import { eq } from 'drizzle-orm';
import { AppError } from '@/lib/errors';
import { post, systemAccountId } from '@/modules/ledger';
import type { Tx } from '@/server/db/client';
import { checkoutSessions, checkoutTransfers } from '@/server/db/schema';
import type { ProviderEvent } from '@/server/providers';
import { settleSession } from './settle';

type Funding = Extract<ProviderEvent, { type: 'funding.received' }>;

async function toSuspense(tx: Tx, event: Funding, reason: string): Promise<void> {
  await post(
    {
      type: 'suspense_funding',
      idempotency: { scope: 'provider', key: event.eventId },
      entries: [
        { accountId: await systemAccountId('provider_clearing', tx), direction: 'debit', amount: event.amount },
        { accountId: await systemAccountId('suspense', tx), direction: 'credit', amount: event.amount },
      ],
      metadata: { event: event.eventId, reason },
    },
    tx,
  );
}

export async function handleCheckoutFunding(event: Funding, tx: Tx): Promise<'matched' | 'unmatched'> {
  const [row] = await tx
    .select({ sessionId: checkoutTransfers.sessionId, amount: checkoutSessions.amount })
    .from(checkoutTransfers)
    .innerJoin(checkoutSessions, eq(checkoutSessions.id, checkoutTransfers.sessionId))
    .where(eq(checkoutTransfers.accountNumber, event.accountNumber))
    .limit(1);
  if (!row) return 'unmatched';

  if (row.amount !== event.amount) {
    await toSuspense(tx, event, 'amount_mismatch');
    return 'matched';
  }

  try {
    await settleSession(row.sessionId, event.eventId, tx);
  } catch (error) {
    if (error instanceof AppError && error.code === 'CHECKOUT_CANCELLED') {
      await toSuspense(tx, event, 'session_cancelled');
      return 'matched';
    }
    throw error;
  }
  return 'matched';
}
