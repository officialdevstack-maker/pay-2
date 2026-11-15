import type { checkoutSessions, merchants } from '@/server/db/schema';

export type Merchant = typeof merchants.$inferSelect;
export type CheckoutSession = typeof checkoutSessions.$inferSelect;

export interface CreateSessionInput {
  amount: bigint;
  merchantReference: string;
  description: string | null;
  idempotencyKey: string;
}
