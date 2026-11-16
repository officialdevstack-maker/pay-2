import 'server-only';
import { count, desc, eq } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { checkoutSessions, merchants, payUsers } from '@/server/db/schema';
import type { AdminCheckoutStatus } from './query';

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
  limit: number,
  status: AdminCheckoutStatus | null,
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

  const rows = status
    ? await db
        .select(fields)
        .from(checkoutSessions)
        .innerJoin(merchants, eq(checkoutSessions.merchantId, merchants.id))
        .where(eq(checkoutSessions.status, status))
        .orderBy(desc(checkoutSessions.createdAt))
        .limit(limit)
    : await db
        .select(fields)
        .from(checkoutSessions)
        .innerJoin(merchants, eq(checkoutSessions.merchantId, merchants.id))
        .orderBy(desc(checkoutSessions.createdAt))
        .limit(limit);

  return rows.map((row) => ({
    ...row,
    amount: row.amount.toString(),
  }));
}
