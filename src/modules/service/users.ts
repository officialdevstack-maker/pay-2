import 'server-only';
import { eq } from 'drizzle-orm';
import { AppError } from '@/lib/errors';
import { db } from '@/server/db/client';
import { payUsers } from '@/server/db/schema';

export async function findUser(sub: string): Promise<{ id: string }> {
  const [row] = await db
    .select({ id: payUsers.id })
    .from(payUsers)
    .where(eq(payUsers.accountsSub, sub))
    .limit(1);
  if (!row) throw new AppError('USER_NOT_FOUND', 'We could not find that user.', 404);
  return row;
}

/** Only `POST /wallets` provisions. Money paths require an existing user, so nothing is created implicitly. */
export async function provisionUser(sub: string): Promise<{ id: string }> {
  await db.insert(payUsers).values({ accountsSub: sub }).onConflictDoNothing({ target: payUsers.accountsSub });
  return findUser(sub);
}
