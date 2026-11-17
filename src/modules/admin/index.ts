import 'server-only';
import { and, count, desc, eq, gte, ilike, lt, lte, or, sql } from 'drizzle-orm';
import { AppError } from '@/lib/errors';
import { db } from '@/server/db/client';
import {
  checkoutAttempts,
  checkoutSessions,
  ledgerAccounts,
  ledgerEntries,
  merchants,
  payUsers,
  transactions,
  webhookEvents,
} from '@/server/db/schema';
import { redactAdminError } from './redact';
import {
  encodeAdminCheckoutCursor,
  type AdminCheckoutCursor,
  type AdminCheckoutStatus,
} from './query';

export async function getAdminStats() {
  const [users, merchantRows, sessionRows] = await Promise.all([
    db.select({ total: count() }).from(payUsers),
    db.select({ total: count() }).from(merchants),
    db
      .select({ status: checkoutSessions.status, total: count() })
      .from(checkoutSessions)
      .groupBy(checkoutSessions.status),
  ]);

  const checkouts: Record<AdminCheckoutStatus, number> = {
    open: 0,
    paid: 0,
    cancelled: 0,
    expired: 0,
  };
  for (const row of sessionRows) checkouts[row.status] = row.total;

  return {
    users: users[0]?.total ?? 0,
    merchants: merchantRows[0]?.total ?? 0,
    checkouts,
  };
}

export async function listAdminCheckouts(
  filters: {
    limit: number;
    status: AdminCheckoutStatus | null;
    merchant: string | null;
    from: Date | null;
    to: Date | null;
    reference: string | null;
    cursor: AdminCheckoutCursor | null;
  },
) {
  const fields = {
    reference: checkoutSessions.reference,
    merchantName: merchants.name,
    merchantReference: checkoutSessions.merchantReference,
    description: checkoutSessions.description,
    amount: checkoutSessions.amount,
    currency: checkoutSessions.currency,
    status: checkoutSessions.status,
    createdAt: checkoutSessions.createdAt,
    paidAt: checkoutSessions.paidAt,
  };

  const conditions = [
    filters.status ? eq(checkoutSessions.status, filters.status) : undefined,
    filters.merchant ? ilike(merchants.name, `%${filters.merchant}%`) : undefined,
    filters.from ? gte(checkoutSessions.createdAt, filters.from) : undefined,
    filters.to ? lte(checkoutSessions.createdAt, filters.to) : undefined,
    filters.reference ? ilike(checkoutSessions.reference, `%${filters.reference}%`) : undefined,
    filters.cursor
      ? or(
          lt(checkoutSessions.createdAt, filters.cursor.createdAt),
          and(
            eq(checkoutSessions.createdAt, filters.cursor.createdAt),
            lt(checkoutSessions.reference, filters.cursor.reference),
          ),
        )
      : undefined,
  ];
  const rows = await db
    .select(fields)
    .from(checkoutSessions)
    .innerJoin(merchants, eq(checkoutSessions.merchantId, merchants.id))
    .where(and(...conditions))
    .orderBy(desc(checkoutSessions.createdAt), desc(checkoutSessions.reference))
    .limit(filters.limit + 1);
  const hasMore = rows.length > filters.limit;
  const page = rows.slice(0, filters.limit);
  const last = page.at(-1);

  return {
    data: page.map((row) => ({
    ...row,
    amount: row.amount.toString(),
    })),
    nextCursor: hasMore && last
      ? encodeAdminCheckoutCursor({ createdAt: last.createdAt, reference: last.reference })
      : null,
  };
}

export async function getAdminCheckout(reference: string) {
  const [session] = await db
    .select({
      id: checkoutSessions.id,
      reference: checkoutSessions.reference,
      merchantName: merchants.name,
      merchantReference: checkoutSessions.merchantReference,
      description: checkoutSessions.description,
      amount: checkoutSessions.amount,
      currency: checkoutSessions.currency,
      status: checkoutSessions.status,
      createdAt: checkoutSessions.createdAt,
      expiresAt: checkoutSessions.expiresAt,
      paidAt: checkoutSessions.paidAt,
      transactionId: checkoutSessions.transactionId,
    })
    .from(checkoutSessions)
    .innerJoin(merchants, eq(checkoutSessions.merchantId, merchants.id))
    .where(eq(checkoutSessions.reference, reference))
    .limit(1);
  if (!session) return null;

  const attempts = await db
    .select({
      method: checkoutAttempts.method,
      status: checkoutAttempts.status,
      createdAt: checkoutAttempts.createdAt,
      resolvedAt: checkoutAttempts.resolvedAt,
    })
    .from(checkoutAttempts)
    .where(eq(checkoutAttempts.sessionId, session.id))
    .orderBy(desc(checkoutAttempts.createdAt), desc(checkoutAttempts.id));

  const [ledgerTransaction] = session.transactionId
    ? await db
        .select({
          reference: transactions.reference,
          type: transactions.type,
          currency: transactions.currency,
          createdAt: transactions.createdAt,
        })
        .from(transactions)
        .where(eq(transactions.id, session.transactionId))
        .limit(1)
    : [];
  const entries = session.transactionId
    ? await db
        .select({
          direction: ledgerEntries.direction,
          amount: ledgerEntries.amount,
          createdAt: ledgerEntries.createdAt,
          accountKind: ledgerAccounts.kind,
          accountCode: ledgerAccounts.code,
        })
        .from(ledgerEntries)
        .innerJoin(ledgerAccounts, eq(ledgerEntries.accountId, ledgerAccounts.id))
        .where(eq(ledgerEntries.transactionId, session.transactionId))
        .orderBy(ledgerEntries.id)
    : [];
  const timeline = [
    { type: 'session_created' as const, at: session.createdAt },
    ...attempts.map((attempt) => ({
      type: 'attempt' as const,
      at: attempt.createdAt,
      method: attempt.method,
      status: attempt.status,
    })),
    ...(session.paidAt ? [{ type: 'session_paid' as const, at: session.paidAt }] : []),
    ...entries.map((entry) => ({
      type: 'ledger_entry' as const,
      at: entry.createdAt,
      direction: entry.direction,
      amount: entry.amount.toString(),
    })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

  return {
    session: { ...session, amount: session.amount.toString() },
    attempts,
    transaction: ledgerTransaction
      ? {
          ...ledgerTransaction,
          entries: entries.map((entry) => ({ ...entry, amount: entry.amount.toString() })),
        }
      : null,
    timeline,
  };
}

export async function listAdminMerchants(input: {
  limit: number;
  status: 'active' | 'suspended' | null;
  search: string | null;
}) {
  const rows = await db
    .select({
      id: merchants.id,
      name: merchants.name,
      status: merchants.status,
      createdAt: merchants.createdAt,
      checkoutCount: sql<number>`count(${checkoutSessions.id})::int`,
      paidCheckoutCount: sql<number>`count(${checkoutSessions.id}) filter (where ${checkoutSessions.status} = 'paid')::int`,
      paidVolume: sql<string>`coalesce(sum(case when ${checkoutSessions.status} = 'paid' then ${checkoutSessions.amount} else 0 end), 0)::text`,
    })
    .from(merchants)
    .leftJoin(checkoutSessions, eq(checkoutSessions.merchantId, merchants.id))
    .where(and(
      input.status ? eq(merchants.status, input.status) : undefined,
      input.search ? ilike(merchants.name, `%${input.search}%`) : undefined,
    ))
    .groupBy(merchants.id)
    .orderBy(desc(merchants.createdAt), desc(merchants.id))
    .limit(input.limit);
  return rows;
}

export async function listAdminWebhookEvents(input: {
  limit: number;
  status: 'received' | 'processed' | 'failed' | null;
}) {
  const rows = await db
    .select({
      id: webhookEvents.id,
      type: webhookEvents.type,
      status: webhookEvents.status,
      attempts: webhookEvents.attempts,
      lastError: webhookEvents.lastError,
      receivedAt: webhookEvents.receivedAt,
      processedAt: webhookEvents.processedAt,
    })
    .from(webhookEvents)
    .where(input.status ? eq(webhookEvents.status, input.status) : undefined)
    .orderBy(desc(webhookEvents.receivedAt), desc(webhookEvents.id))
    .limit(input.limit);
  return rows.map((row) => ({ ...row, lastError: redactAdminError(row.lastError) }));
}

export async function listAdminSuspenseEntries(input: {
  limit: number;
  cursor: bigint | null;
}) {
  const [account] = await db
    .select({ id: ledgerAccounts.id })
    .from(ledgerAccounts)
    .where(eq(ledgerAccounts.code, 'suspense'))
    .limit(1);
  if (!account) return { data: [], nextCursor: null };

  const rows = await db
    .select({
      id: ledgerEntries.id,
      reference: transactions.reference,
      type: transactions.type,
      currency: transactions.currency,
      direction: ledgerEntries.direction,
      amount: ledgerEntries.amount,
      createdAt: ledgerEntries.createdAt,
    })
    .from(ledgerEntries)
    .innerJoin(transactions, eq(ledgerEntries.transactionId, transactions.id))
    .where(and(
      eq(ledgerEntries.accountId, account.id),
      input.cursor === null ? undefined : lt(ledgerEntries.id, input.cursor),
    ))
    .orderBy(desc(ledgerEntries.id))
    .limit(input.limit + 1);
  const hasMore = rows.length > input.limit;
  const page = rows.slice(0, input.limit);
  return {
    data: page.map((row) => ({
      reference: row.reference,
      type: row.type,
      currency: row.currency,
      direction: row.direction,
      amount: row.amount.toString(),
      createdAt: row.createdAt,
    })),
    nextCursor: hasMore ? page.at(-1)?.id.toString() ?? null : null,
  };
}
