import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { CHECKOUT } from '@/config/checkout';
import { openAccount } from '@/modules/ledger';
import { db } from '@/server/db/client';
import { checkoutAttempts, checkoutSessions, merchants, payUsers } from '@/server/db/schema';
import { beginCheckoutAttempt } from './attempts';
import { createSession } from './create';
import { expireStaleAttempts } from './expire';
import { getCheckoutStatus } from './view';

const hasTestDatabase =
  process.env.LEDGER_TEST_DATABASE_URL && process.env.LEDGER_TEST_DATABASE_URL === process.env.DATABASE_URL;
const integration = hasTestDatabase ? describe : describe.skip;

integration('stale checkout attempts', () => {
  afterAll(async () => {
    await db.$client.end();
  });

  async function pendingAttempt(expiredSecondsAgo: number) {
    const [user] = await db.insert(payUsers).values({ accountsSub: randomUUID() }).returning();
    const ledgerAccountId = await openAccount({ kind: 'wallet', normalSide: 'credit' });
    const [merchant] = await db
      .insert(merchants)
      .values({
        name: 'Test Store',
        clientId: `client-${randomUUID()}`,
        ledgerAccountId,
        returnUrl: 'https://store.example.test/return',
        status: 'active',
      })
      .returning();
    if (!user || !merchant) throw new Error('Fixture failed.');

    const { session } = await createSession(merchant, {
      amount: 50_000n,
      merchantReference: `order_${randomUUID().slice(0, 8)}`,
      description: null,
      idempotencyKey: randomUUID(),
    });
    await db.update(checkoutSessions).set({ userId: user.id }).where(eq(checkoutSessions.id, session.id));
    const { attempt } = await beginCheckoutAttempt({
      sessionId: session.id,
      userId: user.id,
      method: 'bank_transfer',
      idempotencyKey: randomUUID(),
      requestHash: 'a'.repeat(64),
    });
    await db
      .update(checkoutSessions)
      .set({ expiresAt: new Date(Date.now() - expiredSecondsAgo * 1000) })
      .where(eq(checkoutSessions.id, session.id));
    return { attempt, sessionId: session.id };
  }

  it('closes an unpaid attempt past the grace window and expires its checkout', async () => {
    const { attempt, sessionId } = await pendingAttempt(CHECKOUT.attemptGraceSeconds + 60);
    await expect(expireStaleAttempts(500)).resolves.toBe(1);

    const [row] = await db.select().from(checkoutAttempts).where(eq(checkoutAttempts.id, attempt.id));
    expect(row?.status).toBe('failed');
    expect(row?.failureCode).toBe('EXPIRED_UNPAID');
    const [session] = await db.select().from(checkoutSessions).where(eq(checkoutSessions.id, sessionId));
    expect(await getCheckoutStatus(session!)).toBe('expired');
  });

  it('leaves an attempt alone while a late transfer could still settle', async () => {
    const { attempt } = await pendingAttempt(60);
    await expect(expireStaleAttempts(500)).resolves.toBe(0);

    const [row] = await db.select().from(checkoutAttempts).where(eq(checkoutAttempts.id, attempt.id));
    expect(row?.status).toBe('pending');
  });
});
