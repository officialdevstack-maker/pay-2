import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { wallets } from '@/server/db/schema';
import { openAccount } from '@/modules/ledger';
import { AppError } from '@/lib/errors';

export type Product = 'pay' | 'wallet';

export async function ensureWallet(userId: string, product: Product = 'pay') {
  return db.transaction(async (tx) => {
    // Serialise concurrent first-logins for the same user, so we never orphan a ledger account.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`wallet:${userId}:${product}`}))`);

    const [existing] = await tx
      .select()
      .from(wallets)
      .where(and(eq(wallets.userId, userId), eq(wallets.product, product)))
      .limit(1);
    if (existing) return existing;

    const ledgerAccountId = await openAccount({ kind: 'wallet', normalSide: 'credit' }, tx);
    const [created] = await tx.insert(wallets).values({ userId, product, ledgerAccountId }).returning();
    if (!created) throw new AppError('INTERNAL', 'Could not create wallet.');
    return created;
  });
}
