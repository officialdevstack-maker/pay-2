import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/server/db/client';
import {
  idempotencyKeys,
  ledgerAccounts,
  ledgerEntries,
  payUsers,
  transactions,
} from '@/server/db/schema';
import { ensureWallet } from '@/modules/wallet';
import { checkInvariants, getBalance, post, reverse, systemAccountId } from './index';

const hasTestDatabase =
  process.env.LEDGER_TEST_DATABASE_URL &&
  process.env.LEDGER_TEST_DATABASE_URL === process.env.DATABASE_URL;
const integration = hasTestDatabase ? describe : describe.skip;

integration('ledger database invariants', () => {
  afterAll(async () => {
    await db.$client.end();
  });

  async function walletPair() {
    const [user] = await db
      .insert(payUsers)
      .values({ accountsSub: `ledger-test-${randomUUID()}` })
      .returning({ id: payUsers.id });
    if (!user) throw new Error('Test user could not be created.');
    const [first, second] = await Promise.all([
      ensureWallet(user.id, 'pay'),
      ensureWallet(user.id, 'wallet'),
    ]);
    return { userId: user.id, first, second };
  }

  async function fund(accountId: string, amount: bigint, scope: string) {
    const suspense = await systemAccountId('suspense');
    return post({
      type: 'funding',
      idempotency: { scope, key: randomUUID() },
      entries: [
        { accountId: suspense, direction: 'debit', amount },
        { accountId, direction: 'credit', amount },
      ],
    });
  }

  it('serializes opposite-direction parallel transfers without deadlocks', async () => {
    const { userId, first, second } = await walletPair();
    await fund(first.ledgerAccountId, 20_000n, userId);
    await fund(second.ledgerAccountId, 20_000n, userId);

    await Promise.all(
      Array.from({ length: 40 }, (_, index) => {
        const [source, destination] = index % 2 === 0 ? [first, second] : [second, first];
        return post({
          type: 'transfer',
          idempotency: { scope: userId, key: randomUUID() },
          entries: [
            { accountId: source.ledgerAccountId, direction: 'debit', amount: 1_000n },
            { accountId: destination.ledgerAccountId, direction: 'credit', amount: 1_000n },
          ],
        });
      }),
    );

    expect(await getBalance(first.ledgerAccountId)).toBe(20_000n);
    expect(await getBalance(second.ledgerAccountId)).toBe(20_000n);
  });

  it('returns the original transaction for concurrent duplicate submissions', async () => {
    const { userId, first, second } = await walletPair();
    await fund(first.ledgerAccountId, 500n, userId);
    const input = {
      type: 'transfer',
      idempotency: { scope: userId, key: randomUUID() },
      entries: [
        { accountId: first.ledgerAccountId, direction: 'debit' as const, amount: 200n },
        { accountId: second.ledgerAccountId, direction: 'credit' as const, amount: 200n },
      ],
    };

    const [original, replay] = await Promise.all([post(input), post(input)]);
    expect(replay.id).toBe(original.id);
    expect([original.replayed, replay.replayed].sort()).toEqual([false, true]);
    await expect(
      post({
        ...input,
        entries: [
          { accountId: first.ledgerAccountId, direction: 'debit', amount: 100n },
          { accountId: second.ledgerAccountId, direction: 'credit', amount: 100n },
        ],
      }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_MISMATCH' });
    expect(await getBalance(first.ledgerAccountId)).toBe(300n);
    expect(await getBalance(second.ledgerAccountId)).toBe(200n);
  });

  it('prevents concurrent spending beyond the available balance', async () => {
    const { userId, first, second } = await walletPair();
    await fund(first.ledgerAccountId, 1_000n, userId);
    const attempts = await Promise.allSettled(
      [0, 1].map(() =>
        post({
          type: 'transfer',
          idempotency: { scope: userId, key: randomUUID() },
          entries: [
            { accountId: first.ledgerAccountId, direction: 'debit', amount: 800n },
            { accountId: second.ledgerAccountId, direction: 'credit', amount: 800n },
          ],
        }),
      ),
    );

    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === 'rejected')).toHaveLength(1);
    expect(await getBalance(first.ledgerAccountId)).toBe(200n);
    expect(await getBalance(second.ledgerAccountId)).toBe(800n);
  });

  it('rolls back an idempotency claim after insufficient funds', async () => {
    const { userId, first, second } = await walletPair();
    const input = {
      type: 'transfer',
      idempotency: { scope: userId, key: randomUUID() },
      entries: [
        { accountId: first.ledgerAccountId, direction: 'debit' as const, amount: 1n },
        { accountId: second.ledgerAccountId, direction: 'credit' as const, amount: 1n },
      ],
    };
    await expect(post(input)).rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS' });

    await fund(first.ledgerAccountId, 1n, userId);
    const result = await post(input);
    expect(result.replayed).toBe(false);
    expect(await getBalance(first.ledgerAccountId)).toBe(0n);
    expect(await getBalance(second.ledgerAccountId)).toBe(1n);
  });

  it('reverses with new entries and prevents a second reversal', async () => {
    const { userId, first, second } = await walletPair();
    await fund(first.ledgerAccountId, 800n, userId);
    const original = await post({
      type: 'transfer',
      idempotency: { scope: userId, key: randomUUID() },
      entries: [
        { accountId: first.ledgerAccountId, direction: 'debit', amount: 300n },
        { accountId: second.ledgerAccountId, direction: 'credit', amount: 300n },
      ],
    });

    const reversalInput = {
      transactionId: original.id,
      idempotency: { scope: userId, key: randomUUID() },
      reason: 'test reversal',
    };
    const reversal = await reverse(reversalInput);
    expect(reversal.id).not.toBe(original.id);
    expect(reversal.entries).toHaveLength(2);
    expect(await getBalance(first.ledgerAccountId)).toBe(800n);
    expect(await getBalance(second.ledgerAccountId)).toBe(0n);
    await expect(reverse(reversalInput)).resolves.toMatchObject({
      id: reversal.id,
      replayed: true,
    });
    await expect(
      reverse({ ...reversalInput, idempotency: { scope: userId, key: randomUUID() } }),
    ).rejects.toMatchObject({ code: 'ALREADY_REVERSED' });
  });

  it('keeps ledger entries and transactions immutable', async () => {
    const { userId, first } = await walletPair();
    const funding = await fund(first.ledgerAccountId, 100n, userId);
    const [entry] = await db
      .select({ id: ledgerEntries.id, accountId: ledgerEntries.accountId })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.transactionId, funding.id))
      .limit(1);
    expect(entry).toBeDefined();
    await expect(
      db.update(ledgerEntries).set({ amount: 99n }).where(eq(ledgerEntries.id, entry!.id)),
    ).rejects.toThrow(/immutable/i);
    await expect(
      db.update(transactions).set({ type: 'changed' }).where(eq(transactions.id, funding.id)),
    ).rejects.toThrow(/immutable/i);
    await expect(
      db
        .update(ledgerAccounts)
        .set({ balance: 99n })
        .where(eq(ledgerAccounts.id, entry!.accountId)),
    ).rejects.toThrow(/balance does not match/i);
  });

  it('keeps idempotency claims after the transaction completes', async () => {
    const { userId, first } = await walletPair();
    const key = randomUUID();
    await post({
      type: 'funding',
      idempotency: { scope: userId, key },
      entries: [
        { accountId: await systemAccountId('suspense'), direction: 'debit', amount: 25n },
        { accountId: first.ledgerAccountId, direction: 'credit', amount: 25n },
      ],
    });

    await expect(
      db
        .delete(idempotencyKeys)
        .where(and(eq(idempotencyKeys.scope, userId), eq(idempotencyKeys.key, key))),
    ).rejects.toThrow(/idempotency records are immutable/i);
  });

  it('maintains the global balance and account cache invariants', async () => {
    const report = await checkInvariants();
    expect(report.ok).toBe(true);
    expect(report.debits).toBe(report.credits);
    expect(report.mismatches).toEqual([]);
  });
});
