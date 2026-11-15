import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { getBalance, openAccount } from '@/modules/ledger';
import { db } from '@/server/db/client';
import { checkoutSessions, checkoutTransfers, merchants } from '@/server/db/schema';
import { createSession } from './create';
import { handleCheckoutFunding } from './transfer-handler';

const hasTestDatabase =
  process.env.LEDGER_TEST_DATABASE_URL && process.env.LEDGER_TEST_DATABASE_URL === process.env.DATABASE_URL;
const integration = hasTestDatabase ? describe : describe.skip;

integration('checkout bank transfer settlement', () => {
  afterAll(async () => {
    await db.$client.end();
  });

  async function setup(amount: bigint) {
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
      amount,
      merchantReference: `order_${randomUUID().slice(0, 8)}`,
      description: null,
      idempotencyKey: randomUUID(),
    });
    const accountNumber = `98${Math.floor(Math.random() * 1e8).toString().padStart(8, '0')}`;
    await db.insert(checkoutTransfers).values({
      sessionId: session.id,
      accountNumber,
      accountName: 'Spurs Pay Test Store',
      bankName: 'Sample Bank One',
      providerRef: `mock_${randomUUID()}`,
    });
    return { ledgerAccountId, session, accountNumber };
  }

  const event = (accountNumber: string, amount: bigint) => ({
    type: 'funding.received' as const,
    eventId: `evt_${randomUUID()}`,
    occurredAt: new Date(),
    accountNumber,
    amount,
    senderName: null,
  });

  const run = (e: ReturnType<typeof event>) => db.transaction((tx) => handleCheckoutFunding(e, tx));

  it('settles an exact payment once, however often the event is delivered', async () => {
    const { ledgerAccountId, session, accountNumber } = await setup(125_000n);
    const e = event(accountNumber, 125_000n);

    expect(await run(e)).toBe('matched');
    expect(await run(e)).toBe('matched');

    expect(await getBalance(ledgerAccountId)).toBe(125_000n);
    const [row] = await db.select().from(checkoutSessions).where(eq(checkoutSessions.id, session.id));
    expect(row?.status).toBe('paid');
  });

  it('parks a wrong amount in suspense and leaves the session open', async () => {
    const { ledgerAccountId, session, accountNumber } = await setup(125_000n);

    expect(await run(event(accountNumber, 100_000n))).toBe('matched');

    expect(await getBalance(ledgerAccountId)).toBe(0n);
    const [row] = await db.select().from(checkoutSessions).where(eq(checkoutSessions.id, session.id));
    expect(row?.status).toBe('open');
  });

  it('leaves unknown accounts for another handler', async () => {
    expect(await run(event('9800000000', 1_000n))).toBe('unmatched');
  });
});
