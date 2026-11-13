import { randomBytes, randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@/lib/errors';
import { getBalance, post, systemAccountId } from '@/modules/ledger';
import { ensureWallet } from '@/modules/wallet';
import { db } from '@/server/db/client';
import { beneficiaries, payUsers } from '@/server/db/schema';

vi.mock('./deps', () => ({
  enforceRate: vi.fn(async () => {}),
  verifyTransactionPin: vi.fn(async () => {}),
  assertCanSend: vi.fn(async () => {}),
  notifyTransfer: vi.fn(async () => {}),
}));

import { notifyTransfer, verifyTransactionPin } from './deps';
import { sendMoney } from './send';
import type { SendInput } from './types';

const hasTestDatabase =
  process.env.LEDGER_TEST_DATABASE_URL && process.env.LEDGER_TEST_DATABASE_URL === process.env.DATABASE_URL;
const integration = hasTestDatabase ? describe : describe.skip;

integration('send money', () => {
  afterAll(async () => {
    await db.$client.end();
  });

  beforeEach(() => vi.clearAllMocks());

  async function person() {
    const tag = `t${randomBytes(6).toString('hex')}`;
    const [user] = await db
      .insert(payUsers)
      .values({ accountsSub: `p2p-test-${randomUUID()}`, tag, displayName: `Person ${tag}` })
      .returning({ id: payUsers.id });
    if (!user) throw new Error('Test user could not be created.');
    const wallet = await ensureWallet(user.id, 'pay');
    return { id: user.id, tag, account: wallet.ledgerAccountId };
  }

  async function funded(amount: bigint) {
    const personRow = await person();
    await post({
      type: 'funding',
      idempotency: { scope: personRow.id, key: randomUUID() },
      entries: [
        { accountId: await systemAccountId('suspense'), direction: 'debit', amount },
        { accountId: personRow.account, direction: 'credit', amount },
      ],
    });
    return personRow;
  }

  const input = (to: { tag: string }, amount: bigint, idempotencyKey = randomUUID()): SendInput => ({
    recipientTag: `@${to.tag}`,
    amount,
    note: null,
    pin: '1234',
    idempotencyKey,
  });
  const asSender = (personRow: { id: string }) => ({ id: personRow.id, name: 'Sender' });

  it('moves money, remembers the recipient and notifies once', async () => {
    const sender = await funded(5_000_000n);
    const recipient = await person();

    const result = await sendMoney(asSender(sender), input(recipient, 1_200n));

    expect(result.reference).toMatch(/^SPY_[0-9A-Z]{16}$/);
    expect(result.replayed).toBe(false);
    expect(await getBalance(sender.account)).toBe(4_998_800n);
    expect(await getBalance(recipient.account)).toBe(1_200n);
    expect(await db.select().from(beneficiaries).where(eq(beneficiaries.ownerId, sender.id))).toHaveLength(1);
    expect(notifyTransfer).toHaveBeenCalledTimes(1);
  });

  it('applies concurrent duplicate requests once', async () => {
    const sender = await funded(10_000n);
    const recipient = await person();
    const key = randomUUID();

    const results = await Promise.all(
      Array.from({ length: 5 }, () => sendMoney(asSender(sender), input(recipient, 500n, key))),
    );

    expect(new Set(results.map((result) => result.reference)).size).toBe(1);
    expect(results.filter((result) => !result.replayed)).toHaveLength(1);
    expect(await getBalance(sender.account)).toBe(9_500n);
    expect(await getBalance(recipient.account)).toBe(500n);
    expect(notifyTransfer).toHaveBeenCalledTimes(1);
  });

  it('rejects a reused key for a different amount', async () => {
    const sender = await funded(10_000n);
    const recipient = await person();
    const key = randomUUID();
    await sendMoney(asSender(sender), input(recipient, 100n, key));

    await expect(sendMoney(asSender(sender), input(recipient, 200n, key))).rejects.toMatchObject({
      code: 'IDEMPOTENCY_MISMATCH',
    });
    expect(await getBalance(sender.account)).toBe(9_900n);
  });

  it('rejects self-transfer and unknown tags', async () => {
    const sender = await funded(1_000n);
    await expect(sendMoney(asSender(sender), input(sender, 100n))).rejects.toMatchObject({
      code: 'SELF_TRANSFER',
    });
    await expect(
      sendMoney(asSender(sender), { ...input(sender, 100n), recipientTag: '@nobody_here_x' }),
    ).rejects.toMatchObject({ code: 'RECIPIENT_NOT_FOUND' });
    expect(await getBalance(sender.account)).toBe(1_000n);
  });

  it('rolls back on insufficient funds and does not notify', async () => {
    const sender = await funded(100n);
    const recipient = await person();

    await expect(sendMoney(asSender(sender), input(recipient, 5_000n))).rejects.toMatchObject({
      code: 'INSUFFICIENT_FUNDS',
    });
    expect(await getBalance(sender.account)).toBe(100n);
    expect(await getBalance(recipient.account)).toBe(0n);
    expect(await db.select().from(beneficiaries).where(eq(beneficiaries.ownerId, sender.id))).toHaveLength(0);
    expect(notifyTransfer).not.toHaveBeenCalled();
  });

  it('stops before the ledger when the PIN is wrong', async () => {
    const sender = await funded(1_000n);
    const recipient = await person();
    vi.mocked(verifyTransactionPin).mockRejectedValueOnce(new AppError('PIN_INVALID', 'Wrong PIN.', 422));

    await expect(sendMoney(asSender(sender), input(recipient, 100n))).rejects.toMatchObject({
      code: 'PIN_INVALID',
    });
    expect(await getBalance(sender.account)).toBe(1_000n);
    expect(await getBalance(recipient.account)).toBe(0n);
  });
});
