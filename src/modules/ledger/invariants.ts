import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/server/db/client';

export interface InvariantReport {
  ok: boolean;
  debits: bigint;
  credits: bigint;
  /** Accounts whose cached balance disagrees with the sum of their entries. */
  mismatches: { accountId: string; cached: bigint; derived: bigint }[];
}

/** Run from tests now, and from the ledger-balance alarm job in Phase 13. */
export async function checkInvariants(): Promise<InvariantReport> {
  const totals = await db.execute(sql`
    select
      coalesce(sum(amount) filter (where direction = 'debit'), 0)::text as debits,
      coalesce(sum(amount) filter (where direction = 'credit'), 0)::text as credits
    from ledger_entries`);
  const drift = await db.execute(sql`
    select a.id::text as id, a.balance::text as cached,
           coalesce(sum(case when e.direction = a.normal_side then e.amount else -e.amount end), 0)::text as derived
    from ledger_accounts a
    left join ledger_entries e on e.account_id = a.id
    group by a.id, a.balance, a.normal_side
    having a.balance <> coalesce(sum(case when e.direction = a.normal_side then e.amount else -e.amount end), 0)`);

  const t = totals.rows[0] as { debits: string; credits: string };
  const mismatches = (drift.rows as { id: string; cached: string; derived: string }[]).map((r) => ({
    accountId: r.id,
    cached: BigInt(r.cached),
    derived: BigInt(r.derived),
  }));
  const debits = BigInt(t.debits);
  const credits = BigInt(t.credits);
  return { ok: debits === credits && mismatches.length === 0, debits, credits, mismatches };
}
