import 'server-only';
import { and, eq, inArray, lt } from 'drizzle-orm';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { db } from '@/server/db/client';
import { checkoutAttempts, checkoutSessions } from '@/server/db/schema';
import { getPayPolicyConfig } from '@/server/admin-config';
import { resolveCheckoutAttempt } from './attempts';

/** Closes unpaid bank-transfer attempts that are past expiry plus the grace window. */
export async function expireStaleAttempts(limit = 50): Promise<number> {
  const { checkout } = await getPayPolicyConfig();
  const cutoff = new Date(Date.now() - checkout.attemptGraceSeconds * 1000);

  const stale = await db
    .select({ id: checkoutAttempts.id })
    .from(checkoutAttempts)
    .innerJoin(checkoutSessions, eq(checkoutSessions.id, checkoutAttempts.sessionId))
    .where(
      and(
        inArray(checkoutAttempts.status, ['pending', 'unknown']),
        eq(checkoutAttempts.method, 'bank_transfer'),
        eq(checkoutSessions.status, 'open'),
        lt(checkoutSessions.expiresAt, cutoff),
      ),
    )
    .limit(limit);

  let closed = 0;
  for (const { id } of stale) {
    try {
      await resolveCheckoutAttempt(id, { status: 'failed', failureCode: 'EXPIRED_UNPAID' });
      closed += 1;
    } catch (error) {
      if (error instanceof AppError && error.code === 'CHECKOUT_ATTEMPT_RESOLVED') continue;
      logger.error('could not expire stale checkout attempt', { id, error });
    }
  }
  return closed;
}
