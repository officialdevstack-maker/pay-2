import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db, type Tx } from '@/server/db/client';
import { idempotencyKeys } from '@/server/db/schema';

export async function hasClaim(scope: string, key: string, tx?: Tx): Promise<boolean> {
  const executor = tx ?? db;
  const [row] = await executor
    .select({ key: idempotencyKeys.key })
    .from(idempotencyKeys)
    .where(and(eq(idempotencyKeys.scope, scope), eq(idempotencyKeys.key, key)))
    .limit(1);
  return Boolean(row);
}
