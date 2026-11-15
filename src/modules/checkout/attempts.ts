import 'server-only';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { AppError } from '@/lib/errors';
import { db, type Tx } from '@/server/db/client';
import { checkoutAttempts, checkoutSessions } from '@/server/db/schema';

export type CheckoutAttempt = typeof checkoutAttempts.$inferSelect;
export type CheckoutMethod = 'wallet' | 'card' | 'bank_transfer';
export type CheckoutAttemptStatus = 'pending' | 'succeeded' | 'failed' | 'unknown';

export interface BeginAttemptInput {
  sessionId: string;
  userId: string;
  method: CheckoutMethod;
  idempotencyKey: string;
  requestHash: string;
}

export type AttemptResolution =
  | { status: 'succeeded' }
  | { status: 'failed'; failureCode: string }
  | { status: 'unknown'; failureCode?: string | null };

const KEY = /^[A-Za-z0-9_-]{16,128}$/;
const HASH = /^[a-f0-9]{64}$/;
const ACTIVE_STATUSES: CheckoutAttemptStatus[] = ['pending', 'unknown'];

export async function beginCheckoutAttempt(
  input: BeginAttemptInput,
): Promise<{ attempt: CheckoutAttempt; replayed: boolean }> {
  if (!KEY.test(input.idempotencyKey) || !HASH.test(input.requestHash)) {
    throw new AppError('BAD_REQUEST', 'A valid payment attempt key and request hash are required.', 400);
  }

  return db.transaction(async (tx) => {
    const [session] = await tx
      .select()
      .from(checkoutSessions)
      .where(eq(checkoutSessions.id, input.sessionId))
      .for('update')
      .limit(1);
    if (!session || (session.userId !== null && session.userId !== input.userId)) {
      throw new AppError('CHECKOUT_NOT_FOUND', 'We could not find that checkout session.', 404);
    }

    if (session.userId === null) {
      await tx
        .update(checkoutSessions)
        .set({ userId: input.userId })
        .where(and(eq(checkoutSessions.id, session.id), isNull(checkoutSessions.userId)));
    }

    const [existing] = await tx
      .select()
      .from(checkoutAttempts)
      .where(
        and(
          eq(checkoutAttempts.sessionId, session.id),
          eq(checkoutAttempts.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1);
    if (existing) {
      if (
        existing.userId !== input.userId ||
        existing.method !== input.method ||
        existing.requestHash !== input.requestHash
      ) {
        throw new AppError('IDEMPOTENCY_MISMATCH', 'This payment attempt key was already used for a different request.', 409);
      }
      return { attempt: existing, replayed: true };
    }

    if (session.status !== 'open') {
      throw new AppError('CHECKOUT_UNAVAILABLE', 'This checkout is no longer available.', 409);
    }

    const [active] = await tx
      .select()
      .from(checkoutAttempts)
      .where(and(eq(checkoutAttempts.sessionId, session.id), inArray(checkoutAttempts.status, ACTIVE_STATUSES)))
      .limit(1);
    if (active) {
      if (
        active.userId === input.userId &&
        active.method === input.method &&
        active.requestHash === input.requestHash
      ) {
        return { attempt: active, replayed: true };
      }
      throw new AppError('CHECKOUT_ATTEMPT_IN_PROGRESS', 'A payment for this checkout is already being confirmed.', 409);
    }

    const now = new Date();
    if (session.status !== 'open' || session.expiresAt <= now) {
      throw new AppError('CHECKOUT_UNAVAILABLE', 'This checkout is no longer available.', 409);
    }

    const [succeeded] = await tx
      .select({ id: checkoutAttempts.id })
      .from(checkoutAttempts)
      .where(and(eq(checkoutAttempts.sessionId, session.id), eq(checkoutAttempts.status, 'succeeded')))
      .limit(1);
    if (succeeded) {
      throw new AppError('CHECKOUT_UNAVAILABLE', 'This checkout has already been paid.', 409);
    }

    const [attempt] = await tx
      .insert(checkoutAttempts)
      .values({
        sessionId: session.id,
        userId: input.userId,
        method: input.method,
        idempotencyKey: input.idempotencyKey,
        requestHash: input.requestHash,
      })
      .returning();
    if (!attempt) throw new AppError('INTERNAL', 'Could not start this payment.');
    return { attempt, replayed: false };
  });
}

export async function getActiveCheckoutAttempt(
  sessionId: string,
  userId: string,
): Promise<CheckoutAttempt | null> {
  const [attempt] = await db
    .select()
    .from(checkoutAttempts)
    .where(
      and(
        eq(checkoutAttempts.sessionId, sessionId),
        eq(checkoutAttempts.userId, userId),
        inArray(checkoutAttempts.status, ACTIVE_STATUSES),
      ),
    )
    .limit(1);
  return attempt ?? null;
}

export async function resolveCheckoutAttempt(
  attemptId: string,
  resolution: AttemptResolution,
  tx?: Tx,
): Promise<CheckoutAttempt> {
  return tx ? runResolution(tx, attemptId, resolution) : db.transaction((inner) => runResolution(inner, attemptId, resolution));
}

export async function resolveActiveAttemptForSession(sessionId: string, tx: Tx): Promise<void> {
  const [attempt] = await tx
    .select({ id: checkoutAttempts.id })
    .from(checkoutAttempts)
    .where(
      and(
        eq(checkoutAttempts.sessionId, sessionId),
        eq(checkoutAttempts.method, 'bank_transfer'),
        inArray(checkoutAttempts.status, ACTIVE_STATUSES),
      ),
    )
    .limit(1);
  if (attempt) await runResolution(tx, attempt.id, { status: 'succeeded' });
}

async function runResolution(tx: Tx, attemptId: string, resolution: AttemptResolution): Promise<CheckoutAttempt> {
  const [found] = await tx
    .select({ sessionId: checkoutAttempts.sessionId })
    .from(checkoutAttempts)
    .where(eq(checkoutAttempts.id, attemptId))
    .limit(1);
  if (!found) throw new AppError('CHECKOUT_ATTEMPT_NOT_FOUND', 'We could not find that payment attempt.', 404);

  const [session] = await tx
    .select()
    .from(checkoutSessions)
    .where(eq(checkoutSessions.id, found.sessionId))
    .for('update')
    .limit(1);
  if (!session) throw new AppError('CHECKOUT_NOT_FOUND', 'We could not find that checkout session.', 404);

  const [attempt] = await tx
    .select()
    .from(checkoutAttempts)
    .where(eq(checkoutAttempts.id, attemptId))
    .for('update')
    .limit(1);
  if (!attempt) throw new AppError('CHECKOUT_ATTEMPT_NOT_FOUND', 'We could not find that payment attempt.', 404);

  if (attempt.status === resolution.status) return attempt;
  if (!ACTIVE_STATUSES.includes(attempt.status)) {
    throw new AppError('CHECKOUT_ATTEMPT_RESOLVED', 'This payment attempt has already been resolved.', 409);
  }
  if (resolution.status === 'succeeded' && session.status !== 'paid') {
    throw new AppError('CHECKOUT_NOT_SETTLED', 'A payment attempt cannot succeed before checkout settlement.', 409);
  }

  if (attempt.status === 'pending' && resolution.status !== 'unknown') {
    await tx
      .update(checkoutAttempts)
      .set({ status: 'unknown', failureCode: null, resolvedAt: null })
      .where(eq(checkoutAttempts.id, attempt.id));
  }

  const [updated] = await tx
    .update(checkoutAttempts)
    .set({
      status: resolution.status,
      failureCode: resolution.status === 'succeeded' ? null : (resolution.failureCode ?? null),
      resolvedAt: resolution.status === 'unknown' ? null : new Date(),
    })
    .where(eq(checkoutAttempts.id, attempt.id))
    .returning();
  if (!updated) throw new AppError('INTERNAL', 'Could not update this payment attempt.');
  return updated;
}
