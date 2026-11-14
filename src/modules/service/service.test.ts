import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { getBalance, post, systemAccountId } from '@/modules/ledger';
import { ensureWallet, setPin } from '@/modules/wallet';
import { db } from '@/server/db/client';
import { beneficiaries, notifications, payUsers } from '@/server/db/schema';

vi.mock('./deps', () => ({ assertUserActive: vi.fn(async () => {}) }));

import {
  getWalletBalance,
  listActivity,
  openWallet,
  setWalletPin,
  transferFunds,
  verifyWalletPin,
} from './wallets';
import type { ServiceCaller } from './types';

const hasTestDatabase =
  process.env.LEDGER_TEST_DATABASE_URL && process.env.LEDGER_TEST_DATABASE_URL === process.env.DATABASE_URL;
const integration = hasTestDatabase ? describe : describe.skip;

const caller: ServiceCaller = { clientId: 'test-wallet', product: 'wallet' };

integration('service API: product isolation', () => {
  afterAll(async () => {
    await db.$client.end();
  });

  async function person() {
    const sub = `svc-test-${randomUUID()}`;
    const [user] = await db.insert(payUsers).values({ accountsSub: sub }).returning({ id: payUsers.id });
    if (!user) throw new Error('Test user could not be created.');
    await openWallet(caller, sub);
    await setWalletPin(caller, sub, '1234');
    return { id: user.id, sub };
  }

  async function fund(userId: string, product: 'pay' | 'wallet', amount: bigint) {
    const wallet = await ensureWallet(userId, product);
    await post({
      type: 'funding',
      idempotency: { scope: userId, key: randomUUID() },
      entries: [
        { accountId: await systemAccountId('suspense'), direction: 'debit', amount },
        { accountId: wallet.ledgerAccountId, direction: 'credit', amount },
      ],
    });
    return wallet;
  }

  const send = (from: { sub: string }, to: { sub: string }, amount: bigint, key = randomUUID()) =>
    transferFunds(caller, {
      fromSub: from.sub,
      toSub: to.sub,
      amount,
      note: null,
      pin: '1234',
      idempotencyKey: key,
    });

  it('cannot spend Pay-product funds', async () => {
    const a = await person();
    const b = await person();
    const payWallet = await fund(a.id, 'pay', 5_000_000n);

    expect((await getWalletBalance(caller, a.sub)).balanceKobo).toBe('0');
    await expect(send(a, b, 1_000n)).rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS' });
    expect(await getBalance(payWallet.ledgerAccountId)).toBe(5_000_000n);
  });

  it('moves wallet funds without touching Pay contacts, notifications or Pay balances', async () => {
    const a = await person();
    const b = await person();
    const payWallet = await fund(a.id, 'pay', 7_000n);
    await fund(a.id, 'wallet', 10_000n);

    const { transfer } = await send(a, b, 2_500n);
    expect(transfer.reference).toMatch(/^SPY_[0-9A-Z]{16}$/);
    expect((await getWalletBalance(caller, a.sub)).balanceKobo).toBe('7500');
    expect((await getWalletBalance(caller, b.sub)).balanceKobo).toBe('2500');
    expect(await getBalance(payWallet.ledgerAccountId)).toBe(7_000n);

    expect(await db.select().from(beneficiaries).where(eq(beneficiaries.ownerId, a.id))).toHaveLength(0);
    expect(await db.select().from(notifications).where(eq(notifications.userId, b.id))).toHaveLength(0);

    const activity = await listActivity(caller, a.sub, { cursor: null, limit: 20 });
    expect(activity.items.map((item) => [item.kind, item.amountKobo])).toEqual([
      ['out', '2500'],
      ['in', '10000'],
    ]);
    expect(activity.items[0]?.counterpartySub).toBe(b.sub);
    expect(activity.nextCursor).toBeNull();
  });

  it('does not accept the Pay PIN for the wallet product', async () => {
    const [user] = await db
      .insert(payUsers)
      .values({ accountsSub: `svc-test-${randomUUID()}` })
      .returning({ id: payUsers.id, sub: payUsers.accountsSub });
    if (!user) throw new Error('Test user could not be created.');
    await setPin(user.id, 'pay', '1234');
    await expect(verifyWalletPin(caller, user.sub, '1234')).rejects.toMatchObject({ code: 'PIN_NOT_SET' });
  });

  it('applies a double-submitted transfer once', async () => {
    const a = await person();
    const b = await person();
    await fund(a.id, 'wallet', 10_000n);
    const key = randomUUID();

    const results = await Promise.all(Array.from({ length: 5 }, () => send(a, b, 500n, key)));
    expect(new Set(results.map((r) => r.transfer.reference)).size).toBe(1);
    expect(results.filter((r) => !r.replayed)).toHaveLength(1);
    expect((await getWalletBalance(caller, a.sub)).balanceKobo).toBe('9500');
  });

  it('refuses unknown users instead of provisioning them on money paths', async () => {
    const a = await person();
    await expect(send(a, { sub: `ghost-${randomUUID()}` }, 100n)).rejects.toMatchObject({
      code: 'USER_NOT_FOUND',
    });
  });
});
