import 'server-only';
import { and, eq, isNull } from 'drizzle-orm';
import { isUniqueViolation } from '@/lib/db-errors';
import { AppError } from '@/lib/errors';
import { checkTag } from '@/lib/tag';
import { db } from '@/server/db/client';
import { payUsers } from '@/server/db/schema';

export async function setTag(userId: string, raw: string): Promise<string> {
  const checked = checkTag(raw);
  if (!checked.ok) throw new AppError('INVALID_TAG', checked.message, 422);

  try {
    const [row] = await db
      .update(payUsers)
      .set({ tag: checked.tag })
      .where(and(eq(payUsers.id, userId), isNull(payUsers.tag)))
      .returning({ tag: payUsers.tag });
    if (!row?.tag) throw new AppError('TAG_ALREADY_SET', 'Your tag is already set and cannot be changed.', 409);
    return row.tag;
  } catch (error) {
    if (isUniqueViolation(error, 'pay_users_tag_unique')) {
      throw new AppError('TAG_TAKEN', 'That tag is taken.', 409);
    }
    throw error;
  }
}
