import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import type * as Ledger from './index';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('ledger (postgres)', () => {
  let L!: typeof Ledger;
  const scope = 'test';
  const key = () => `k_${randomUUID()}`;

  beforeAll(async () => {
    L = await import('./index');
  });

  async function fund(accountId: string, amount: bigint) {
    return L.post({
      type: 'funding',
      idempotency: { scope, key: key() },
      entries: [
        { accountId: await L.systemAccountId('provider_clearing'), direction: 'debit', amount },
        { accountId, direction: 'credit', amount },
      ],
    });
  }

  async function wallet(balance = 0n) {
    const id = await L.openAccount({ kind: 'wallet', normalSide: 'credit' });
    if (balance > 0n) await fund(id, balance);
    return id;
  }

  const transfer = (from: string, to: string, amount: bigint, k = key()) =>
    L.post({
      type: 'transfer',
      idempotency: { scope, key: k },
      entries: [
        { accountId: from, direction: 'debit', amount },
        { accountId: to, direction: 'credit', amount },
      ],
    });

  it('moves money and records balance_after', async () => {
    const a = await wallet(5_000n);
    const b = await wallet();
    const result = await transfer(a, b, 1_200n);
    expect(result.reference).toMatch(/^SPY_[0-9A-Z]{16}$/);
    expect(await L.getBalance(a)).toBe(3_800n);
    expect(await L.getBalance(b)).toBe(1_200n);
    expect(result.entries.map((e) => e.balanceAfter)).toEqual([3_800n, 1_200n]);
  });

  it('rejects insufficient funds and leaves balances untouched', async () => {
    const a = await wallet(1_000n);
    const b = await wallet();
    await expect(transfer(a, b, 2_000n)).rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS' });
    expect(await L.getBalance(a)).toBe(1_000n);
    expect(await L.getBalance(b)).toBe(0n);
  });

  it('applies a double submit once, however many arrive at the same time', async () => {
    const a = await wallet(10_000n);
    const b = await wallet();
    const k = key();
    const results = await Promise.all(Array.from({ length: 10 }, () => transfer(a, b, 500n, k)));
    expect(new Set(results.map((r) => r.id)).size).toBe(1);
    expect(results.filter((r) => !r.replayed)).toHaveLength(1);
    expect(await L.getBalance(a)).toBe(9_500n);
    expect(await L.getBalance(b)).toBe(500n);
  });

  it('refuses a reused key for a different request', async () => {
    const a = await wallet(10_000n);
    const b = await wallet();
    const k = key();
    await transfer(a, b, 100n, k);
    await expect(transfer(a, b, 200n, k)).rejects.toMatchObject({ code: 'IDEMPOTENCY_MISMATCH' });
  });

  it('rolls back everything on failure and does not burn the key', async () => {
    const a = await wallet(1_000n);
    const k = key();
    await expect(
      transfer(a, randomUUID(), 100n, k), // second account does not exist
    ).rejects.toMatchObject({ code: 'ACCOUNT_NOT_FOUND' });
    expect(await L.getBalance(a)).toBe(1_000n);

    const b = await wallet();
    const retry = await transfer(a, b, 100n, k);
    expect(retry.replayed).toBe(false);
  });

  it('survives parallel transfers in both directions without deadlock or drift', async () => {
    const a = await wallet(10_000n);
    const b = await wallet(10_000n);
    const jobs = Array.from({ length: 30 }, () => [transfer(a, b, 100n), transfer(b, a, 100n)]).flat();
    const settled = await Promise.allSettled(jobs);
    expect(settled.every((r) => r.status === 'fulfilled')).toBe(true);
    expect(await L.getBalance(a)).toBe(10_000n);
    expect(await L.getBalance(b)).toBe(10_000n);
    expect((await L.checkInvariants()).ok).toBe(true);
  });

  it('never overdraws under contention', async () => {
    const a = await wallet(10_000n);
    const b = await wallet();
    const settled = await Promise.allSettled(Array.from({ length: 50 }, () => transfer(a, b, 300n)));
    const ok = settled.filter((r) => r.status === 'fulfilled').length;
    expect(ok).toBe(33); // 33 x 300 = 9,900 <= 10,000 < 34 x 300
    expect(await L.getBalance(a)).toBe(10_000n - BigInt(ok) * 300n);
    expect(await L.getBalance(b)).toBe(BigInt(ok) * 300n);
    for (const r of settled) {
      if (r.status === 'rejected') expect(r.reason).toMatchObject({ code: 'INSUFFICIENT_FUNDS' });
    }
  });

  it('reverses a transaction exactly once', async () => {
    const a = await wallet(5_000n);
    const b = await wallet();
    const original = await transfer(a, b, 1_000n);

    const rev = await L.reverse({ transactionId: original.id, idempotency: { scope, key: key() }, reason: 'test' });
    expect(rev.type).toBe('reversal');
    expect(await L.getBalance(a)).toBe(5_000n);
    expect(await L.getBalance(b)).toBe(0n);

    await expect(
      L.reverse({ transactionId: original.id, idempotency: { scope, key: key() } }),
    ).rejects.toMatchObject({ code: 'ALREADY_REVERSED' });
    await expect(
      L.reverse({ transactionId: rev.id, idempotency: { scope, key: key() } }),
    ).rejects.toMatchObject({ code: 'LEDGER_INVALID' });
  });

  it('the database itself refuses edits, deletes and negative wallets', async () => {
    const { db } = await import('@/server/db/client');
    const { sql } = await import('drizzle-orm');
    const a = await wallet(1_000n);
    await expect(db.execute(sql`update ledger_entries set amount = 1`)).rejects.toThrow();
    await expect(db.execute(sql`delete from transactions`)).rejects.toThrow();
    await expect(db.execute(sql`update ledger_accounts set balance = -1 where id = ${a}`)).rejects.toThrow();
  });

  it('keeps the global ledger balanced', async () => {
    const report = await L.checkInvariants();
    expect(report.mismatches).toEqual([]);
    expect(report.debits).toBe(report.credits);
  });
});
