import 'server-only';
import { and, desc, eq, gte, isNotNull, or, sql } from 'drizzle-orm';
import { AppError } from '@/lib/errors';
import { checkTag } from '@/lib/tag';
import { db } from '@/server/db/client';
import { beneficiaries, payUsers } from '@/server/db/schema';
import { enforceRate } from './deps';
import type { RecipientView } from './types';

export interface ResolvedRecipient extends RecipientView {
  userId: string;
}

const recipientName = (row: { tag: string; displayName: string | null }) =>
  row.displayName ?? `@${row.tag}`;

export async function resolveRecipientByTag(raw: string): Promise<ResolvedRecipient> {
  const notFound = () => new AppError('RECIPIENT_NOT_FOUND', 'We could not find that tag.', 404);
  const checked = checkTag(raw);
  if (!checked.ok) throw notFound();

  const [row] = await db
    .select({ id: payUsers.id, tag: payUsers.tag, displayName: payUsers.displayName })
    .from(payUsers)
    .where(eq(payUsers.tag, checked.tag))
    .limit(1);
  if (!row?.tag) throw notFound();
  return { userId: row.id, tag: row.tag, name: recipientName({ tag: row.tag, displayName: row.displayName }) };
}

export async function lookupRecipient(actorId: string, raw: string, ip?: string): Promise<RecipientView> {
  await enforceRate('lookup', actorId, ip);
  const recipient = await resolveRecipientByTag(raw);
  if (recipient.userId === actorId) {
    throw new AppError('SELF_TRANSFER', 'You cannot send money to yourself.', 422);
  }
  return { name: recipient.name, tag: recipient.tag };
}

export async function listRecentRecipients(
  ownerId: string,
  options: { query?: string | null; limit?: number; ip?: string } = {},
): Promise<RecipientView[]> {
  await enforceRate('lookup', ownerId, options.ip);
  const limit = Math.min(Math.max(options.limit ?? 10, 1), 30);
  const query = options.query?.trim().replace(/^@/, '').slice(0, 30);
  const escaped = query ? query.replace(/[\\%_]/g, '\\$&') : null;

  const rows = await db
    .select({ tag: payUsers.tag, displayName: payUsers.displayName })
    .from(beneficiaries)
    .innerJoin(payUsers, eq(payUsers.id, beneficiaries.recipientId))
    .where(
      and(
        eq(beneficiaries.ownerId, ownerId),
        isNotNull(payUsers.tag),
        escaped
          ? or(
              sql`${payUsers.tag} ilike ${`${escaped}%`} escape '\\'`,
              sql`${payUsers.displayName} ilike ${`%${escaped}%`} escape '\\'`,
            )
          : undefined,
      ),
    )
    .orderBy(desc(beneficiaries.lastSentAt))
    .limit(limit);

  return rows.flatMap((row) =>
    row.tag ? [{ tag: row.tag, name: recipientName({ tag: row.tag, displayName: row.displayName }) }] : [],
  );
}
