import 'server-only';
import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { listActivity, type ActivityItem } from '@/modules/activity';
import { db } from '@/server/db/client';
import { beneficiaries, payUsers, walletPins } from '@/server/db/schema';

export interface HomePerson {
  tag: string;
  name: string;
}

export interface HomeData {
  tag: string | null;
  pinSet: boolean;
  people: HomePerson[];
  activity: ActivityItem[];
}

export async function getHomeData(userId: string): Promise<HomeData> {
  const [[profile], [pin], peopleRows, activity] = await Promise.all([
    db.select({ tag: payUsers.tag }).from(payUsers).where(eq(payUsers.id, userId)).limit(1),
    db
      .select({ userId: walletPins.userId })
      .from(walletPins)
      .where(and(eq(walletPins.userId, userId), eq(walletPins.product, 'pay')))
      .limit(1),
    db
      .select({ tag: payUsers.tag, displayName: payUsers.displayName })
      .from(beneficiaries)
      .innerJoin(payUsers, eq(payUsers.id, beneficiaries.recipientId))
      .where(and(eq(beneficiaries.ownerId, userId), isNotNull(payUsers.tag)))
      .orderBy(desc(beneficiaries.lastSentAt))
      .limit(7),
    listActivity(userId, 'all', 5),
  ]);

  return {
    tag: profile?.tag ?? null,
    pinSet: Boolean(pin),
    people: peopleRows.flatMap((r) => (r.tag ? [{ tag: r.tag, name: r.displayName ?? `@${r.tag}` }] : [])),
    activity,
  };
}
