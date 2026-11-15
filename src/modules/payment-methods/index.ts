import 'server-only';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { paymentMethods } from '@/server/db/schema';

export interface PaymentMethodView {
  id: string;
  kind: 'card';
  /** "Visa •••• 5438" */
  title: string;
  /** "Expires 08/28" */
  expiry: string;
  needsAttention: boolean;
}

const BRAND = { visa: 'Visa', mastercard: 'Mastercard', verve: 'Verve' } as const;

export async function listPaymentMethods(userId: string): Promise<PaymentMethodView[]> {
  const rows = await db
    .select()
    .from(paymentMethods)
    .where(eq(paymentMethods.userId, userId))
    .orderBy(asc(paymentMethods.createdAt));

  const now = new Date();
  const thisYear = now.getUTCFullYear();
  const thisMonth = now.getUTCMonth() + 1;

  return rows.map((row) => {
    const expired = row.expYear < thisYear || (row.expYear === thisYear && row.expMonth < thisMonth);
    return {
      id: row.id,
      kind: row.kind,
      title: `${BRAND[row.brand]} •••• ${row.last4}`,
      expiry: `Expires ${String(row.expMonth).padStart(2, '0')}/${String(row.expYear % 100).padStart(2, '0')}`,
      needsAttention: row.status === 'needs_attention' || expired,
    };
  });
}
