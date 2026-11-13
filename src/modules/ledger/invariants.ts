import 'server-only';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { ledgerAccounts, ledgerEntries } from '@/server/db/schema';

export interface InvariantReport {
  ok: boolean;
  debits: bigint;
  credits: bigint;
  /** Accounts whose cached balance disagrees with the sum of their entries. */
  mismatches: { accountId: string; cached: bigint; derived: bigint }[];
}

/** Run from tests now, and from the ledger-balance alarm job in Phase 13. */
export async function checkInvariants(): Promise<InvariantReport> {
  const [totals] = await db
    .select({
      debits: sql<bigint>`coalesce(sum(${ledgerEntries.amount}) filter (where ${ledgerEntries.direction} = 'debit'), 0)`.mapWith(
        BigInt,
      ),
      credits: sql<bigint>`coalesce(sum(${ledgerEntries.amount}) filter (where ${ledgerEntries.direction} = 'credit'), 0)`.mapWith(
        BigInt,
      ),
    })
    .from(ledgerEntries);

  const derivedBalance = sql<bigint>`
    coalesce(
      sum(case when ${ledgerEntries.direction} = ${ledgerAccounts.normalSide}
        then ${ledgerEntries.amount} else -${ledgerEntries.amount} end),
      0
    )`.mapWith(BigInt);
  const drift = await db
    .select({
      accountId: ledgerAccounts.id,
      cached: ledgerAccounts.balance,
      derived: derivedBalance,
    })
    .from(ledgerAccounts)
    .leftJoin(ledgerEntries, eq(ledgerEntries.accountId, ledgerAccounts.id))
    .groupBy(ledgerAccounts.id, ledgerAccounts.balance, ledgerAccounts.normalSide)
    .having(sql`${ledgerAccounts.balance} <> ${derivedBalance}`);

  const debits = totals?.debits ?? 0n;
  const credits = totals?.credits ?? 0n;
  const mismatches = drift.map(({ accountId, cached, derived }) => ({
    accountId,
    cached,
    derived,
  }));
  return { ok: debits === credits && mismatches.length === 0, debits, credits, mismatches };
}
