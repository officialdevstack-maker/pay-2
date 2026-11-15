import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { openAccount } from '@/modules/ledger';
import { db } from '@/server/db/client';
import { checkoutSessions, merchants, payUsers } from '@/server/db/schema';
import { createSession } from './create';
import { beginCheckoutAttempt, resolveCheckoutAttempt } from './attempts';

const hasTestDatabase = Boolean(
  process.env.LEDGER_TEST_DATABASE_URL && process.env.LEDGER_TEST_DATABASE_URL === process.env.DATABASE_URL,
);
const integration = hasTestDatabase ? describe : describe.skip;

integration('checkout attempts', () => {
  afterAll(async () => {
    await db.$client.end();
  });

  async function setup() {
    const [user, otherUser] = await db
      .insert(payUsers)
      .values([{ accountsSub: randomUUID() }, { accountsSub: randomUUID() }])
      .returning();
    if (!user || !otherUser) throw new Error('Test users could not be created.');

    const ledgerAccountId = await openAccount({ kind: 'wallet', normalSide: 'credit' });
    const [merchant] = await db
      .insert(merchants)
      .values({
        name: 'Test Store',
        clientId: `client-${randomUUID()}`,
        ledgerAccountId,
        returnUrl: 'https://store.example.test/return',
      })
      .returning();
    if (!merchant) throw new Error('Merchant could not be created.');

    const { session } = await createSession(merchant, {
      amount: 125_000n,
      merchantReference: `order_${randomUUID().slice(0, 8)}`,
      description: null,
      idempotencyKey: randomUUID(),
    });
    return { session, user, otherUser };
  }

  const input = (sessionId: string, userId: string, idempotencyKey = randomUUID(), requestHash = 'a'.repeat(64)) => ({
    sessionId,
    userId,
    method: 'bank_transfer' as const,
    idempotencyKey,
    requestHash,
  });

  it('reuses the same attempt for an identical idempotent retry', async () => {
    const { session, user } = await setup();
    const request = input(session.id, user.id);

    const first = await beginCheckoutAttempt(request);
    const replay = await beginCheckoutAttempt(request);

    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.attempt.id).toBe(first.attempt.id);
  });

  it('rejects a request-hash mismatch for a reused idempotency key', async () => {
    const { session, user } = await setup();
    const key = randomUUID();
    await beginCheckoutAttempt(input(session.id, user.id, key));

    await expect(
      beginCheckoutAttempt(input(session.id, user.id, key, 'b'.repeat(64))),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_MISMATCH' });
  });

  it('keeps an unknown attempt active and never starts a second attempt', async () => {
    const { session, user } = await setup();
    const first = await beginCheckoutAttempt(input(session.id, user.id));
    await resolveCheckoutAttempt(first.attempt.id, { status: 'unknown', failureCode: 'TIMEOUT' });

    const retry = await beginCheckoutAttempt(input(session.id, user.id, randomUUID()));
    expect(retry.attempt.id).toBe(first.attempt.id);
    expect(retry.attempt.status).toBe('unknown');
    expect(retry.replayed).toBe(true);

    await expect(
      beginCheckoutAttempt(input(session.id, user.id, randomUUID(), 'b'.repeat(64))),
    ).rejects.toMatchObject({ code: 'CHECKOUT_ATTEMPT_IN_PROGRESS' });
  });

  it('allows a new attempt after a failed attempt', async () => {
    const { session, user } = await setup();
    const first = await beginCheckoutAttempt(input(session.id, user.id));
    await resolveCheckoutAttempt(first.attempt.id, { status: 'failed', failureCode: 'DECLINED' });

    const retry = await beginCheckoutAttempt(input(session.id, user.id, randomUUID(), 'b'.repeat(64)));
    expect(retry.replayed).toBe(false);
    expect(retry.attempt.id).not.toBe(first.attempt.id);
  });

  it('serializes concurrent submissions into one active attempt', async () => {
    const { session, user } = await setup();
    const [first, second] = await Promise.all([
      beginCheckoutAttempt(input(session.id, user.id, randomUUID())),
      beginCheckoutAttempt(input(session.id, user.id, randomUUID())),
    ]);

    expect(first.attempt.id).toBe(second.attempt.id);
    expect(first.attempt.status).toBe('pending');
    expect(second.attempt.status).toBe('pending');
  });

  it('keeps the session bound to its first customer', async () => {
    const { session, user, otherUser } = await setup();
    await beginCheckoutAttempt(input(session.id, user.id));

    await expect(beginCheckoutAttempt(input(session.id, otherUser.id))).rejects.toMatchObject({
      code: 'CHECKOUT_NOT_FOUND',
    });
    const [bound] = await db.select().from(checkoutSessions).where(eq(checkoutSessions.id, session.id));
    expect(bound?.userId).toBe(user.id);
  });

  it('rejects a new attempt after session expiry', async () => {
    const { session, user } = await setup();
    await db
      .update(checkoutSessions)
      .set({ expiresAt: new Date(Date.now() - 1_000) })
      .where(eq(checkoutSessions.id, session.id));

    await expect(beginCheckoutAttempt(input(session.id, user.id))).rejects.toMatchObject({
      code: 'CHECKOUT_UNAVAILABLE',
    });
  });
});
