import 'server-only';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { ensureWallet } from '@/modules/wallet';
import { db } from '@/server/db/client';
import { ledgerEntries, payUsers, transactions } from '@/server/db/schema';

export const ACTIVITY_FILTERS = ['all', 'sent', 'received', 'added'] as const;
export type ActivityFilter = (typeof ACTIVITY_FILTERS)[number];

export const parseFilter = (value: string | undefined): ActivityFilter =>
  (ACTIVITY_FILTERS as readonly string[]).includes(value ?? '') ? (value as ActivityFilter) : 'all';

export interface ActivityItem {
  entryId: bigint;
  reference: string;
  title: string;
  label: 'Sent' | 'Received' | 'Reversed' | 'Added money';
  kind: 'in' | 'out';
  amount: bigint;
  createdAt: Date;
}

export interface Receipt {
  reference: string;
  title: string;
  kind: 'in' | 'out';
  amount: bigint;
  createdAt: Date;
  label: 'Sent' | 'Received' | 'Reversed' | 'Added money';
  note?: string;
}

export async function listActivity(userId: string, filter: ActivityFilter = 'all', limit = 20) {
  const wallet = await ensureWallet(userId, 'pay');
  const rows = await db
    .select({
      id: ledgerEntries.id,
      direction: ledgerEntries.direction,
      amount: ledgerEntries.amount,
      createdAt: ledgerEntries.createdAt,
      reference: transactions.reference,
      type: transactions.type,
      metadata: transactions.metadata,
    })
    .from(ledgerEntries)
    .innerJoin(transactions, eq(transactions.id, ledgerEntries.transactionId))
    .where(and(eq(ledgerEntries.accountId, wallet.ledgerAccountId), getFilterClause(filter)))
    .orderBy(desc(ledgerEntries.id))
    .limit(limit);

  const counterpartyIds = rows
    .map((row) => {
      if (row.type !== 'transfer') return null;
      const key = row.direction === 'credit' ? 'sender' : 'recipient';
      const value = row.metadata[key];
      return typeof value === 'string' ? value : null;
    })
    .filter((id): id is string => id !== null);

  const counterparties =
    counterpartyIds.length > 0
      ? await db
          .select({ id: payUsers.id, tag: payUsers.tag, displayName: payUsers.displayName })
          .from(payUsers)
          .where(inArray(payUsers.id, counterpartyIds))
      : [];

  const nameById = new Map(
    counterparties.map((person) => [person.id, person.displayName ?? (person.tag ? `@${person.tag}` : 'Spurs Pay user')]),
  );

  return rows.map((row) => {
    const kind = row.direction === 'credit' ? 'in' : 'out';
    const partnerId = row.type === 'transfer' ? row.metadata[row.direction === 'credit' ? 'sender' : 'recipient'] : null;
    const title =
      row.type === 'funding'
        ? 'Added money'
        : row.type === 'reversal'
          ? 'Reversal'
          : typeof partnerId === 'string'
            ? nameById.get(partnerId) ?? 'Spurs Pay user'
            : 'Spurs Pay user';

    return {
      entryId: row.id,
      reference: row.reference,
      title,
      label: row.type === 'reversal' ? 'Reversed' : row.type === 'funding' ? 'Added money' : kind === 'in' ? 'Received' : 'Sent',
      kind,
      amount: row.amount,
      createdAt: row.createdAt,
    } satisfies ActivityItem;
  });
}

export async function getActivityReceipt(userId: string, reference: string): Promise<Receipt | null> {
  const wallet = await ensureWallet(userId, 'pay');
  const [entry] = await db
    .select({
      amount: ledgerEntries.amount,
      direction: ledgerEntries.direction,
      createdAt: ledgerEntries.createdAt,
      reference: transactions.reference,
      type: transactions.type,
      metadata: transactions.metadata,
    })
    .from(ledgerEntries)
    .innerJoin(transactions, eq(transactions.id, ledgerEntries.transactionId))
    .where(and(eq(ledgerEntries.accountId, wallet.ledgerAccountId), eq(transactions.reference, reference)))
    .limit(1);

  if (!entry) return null;

  const kind = entry.direction === 'credit' ? 'in' : 'out';
  const partnerId = entry.type === 'transfer' ? entry.metadata[entry.direction === 'credit' ? 'sender' : 'recipient'] : null;
  const title =
    entry.type === 'funding'
      ? 'Added money'
      : entry.type === 'reversal'
        ? 'Reversal'
        : typeof partnerId === 'string'
          ? (await getPersonName(partnerId)) ?? 'Spurs Pay user'
          : 'Spurs Pay user';

  return {
    reference: entry.reference,
    title,
    kind,
    amount: entry.amount,
    createdAt: entry.createdAt,
    label: entry.type === 'reversal' ? 'Reversed' : entry.type === 'funding' ? 'Added money' : kind === 'in' ? 'Received' : 'Sent',
  };
}

async function getPersonName(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ displayName: payUsers.displayName, tag: payUsers.tag })
    .from(payUsers)
    .where(eq(payUsers.id, userId))
    .limit(1);
  return row?.displayName ?? (row?.tag ? `@${row.tag}` : null);
}

function getFilterClause(filter: ActivityFilter) {
  switch (filter) {
    case 'sent':
      return sql`${ledgerEntries.direction} = 'debit' and ${transactions.type} <> 'funding'`;
    case 'received':
      return sql`${ledgerEntries.direction} = 'credit' and ${transactions.type} <> 'funding'`;
    case 'added':
      return sql`${transactions.type} = 'funding'`;
    default:
      return sql`1 = 1`;
  }
}
