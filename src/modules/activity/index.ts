import 'server-only';
import { and, desc, eq, sql, type SQL } from 'drizzle-orm';
import { getCheckoutStatus, type PublicCheckoutStatus } from '@/modules/checkout';
import { db } from '@/server/db/client';
import { checkoutAttempts, checkoutSessions, merchants } from '@/server/db/schema';

export const ACTIVITY_FILTERS = ['all', 'paid', 'pending'] as const;
export type ActivityFilter = (typeof ACTIVITY_FILTERS)[number];

export const parseFilter = (value: string | undefined): ActivityFilter =>
  (ACTIVITY_FILTERS as readonly string[]).includes(value ?? '') ? (value as ActivityFilter) : 'all';

const STATUS_LABEL: Record<PublicCheckoutStatus, string> = {
  open: 'Not completed',
  pending: 'Processing',
  paid: 'Paid',
  reversed: 'Reversed',
  cancelled: 'Cancelled',
  expired: 'Expired',
};

const METHOD_LABEL = { wallet: 'Spurs Wallet', card: 'Card', bank_transfer: 'Bank transfer' } as const;

export interface ActivityItem {
  reference: string;
  title: string;
  status: PublicCheckoutStatus;
  label: string;
  amount: bigint;
  createdAt: Date;
  kind?: 'in' | 'out';
  entryId?: bigint;
}

export interface Receipt extends ActivityItem {
  method: string | null;
  description: string | null;
}

const hasAttempt = sql`exists (select 1 from ${checkoutAttempts} where ${checkoutAttempts.sessionId} = ${checkoutSessions.id})`;
const hasActiveAttempt = sql`exists (select 1 from ${checkoutAttempts} where ${checkoutAttempts.sessionId} = ${checkoutSessions.id} and ${checkoutAttempts.status} in ('pending', 'unknown'))`;

function filterClause(filter: ActivityFilter): SQL {
  switch (filter) {
    case 'paid':
      return sql`${checkoutSessions.status} = 'paid'`;
    case 'pending':
      return sql`${checkoutSessions.status} = 'open' and ${hasActiveAttempt}`;
    default:
      return sql`(${checkoutSessions.status} = 'paid' or ${hasAttempt})`;
  }
}

export async function listActivity(userId: string, filter: ActivityFilter = 'all', limit = 20): Promise<ActivityItem[]> {
  const rows = await db
    .select({ session: checkoutSessions, merchantName: merchants.name })
    .from(checkoutSessions)
    .innerJoin(merchants, eq(merchants.id, checkoutSessions.merchantId))
    .where(and(eq(checkoutSessions.userId, userId), filterClause(filter)))
    .orderBy(desc(checkoutSessions.createdAt))
    .limit(limit);

  return Promise.all(
    rows.map(async ({ session, merchantName }) => {
      const status = await getCheckoutStatus(session);
      return {
        reference: session.reference,
        title: merchantName,
        status,
        label: STATUS_LABEL[status],
        amount: session.amount,
        createdAt: session.paidAt ?? session.createdAt,
        kind: 'out',
      } satisfies ActivityItem;
    }),
  );
}

export async function getActivityReceipt(userId: string, reference: string): Promise<Receipt | null> {
  const [row] = await db
    .select({ session: checkoutSessions, merchantName: merchants.name })
    .from(checkoutSessions)
    .innerJoin(merchants, eq(merchants.id, checkoutSessions.merchantId))
    .where(and(eq(checkoutSessions.userId, userId), eq(checkoutSessions.reference, reference)))
    .limit(1);
  if (!row) return null;

  const [attempt] = await db
    .select({ method: checkoutAttempts.method })
    .from(checkoutAttempts)
    .where(eq(checkoutAttempts.sessionId, row.session.id))
    .orderBy(desc(checkoutAttempts.createdAt), desc(checkoutAttempts.id))
    .limit(1);

  const status = await getCheckoutStatus(row.session);
  return {
    reference: row.session.reference,
    title: row.merchantName,
    status,
    label: STATUS_LABEL[status],
    amount: row.session.amount,
    createdAt: row.session.paidAt ?? row.session.createdAt,
    method: attempt ? METHOD_LABEL[attempt.method] : null,
    description: row.session.description,
    kind: 'out',
  } satisfies Receipt;
}
