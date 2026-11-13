import 'server-only';
import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { RATE_RULES } from '@/config/rate-limits';
import { AppError } from '@/lib/errors';
import { db } from '@/server/db/client';
import { rateLimits } from '@/server/db/schema';

export type RateLimitRule = keyof typeof RATE_RULES;

export async function rateLimit(rule: RateLimitRule, identity: string): Promise<void> {
  if (!identity) throw new AppError('BAD_REQUEST', 'Rate-limit identity is required.', 400);

  const config = RATE_RULES[rule];
  const now = new Date();
  const cutoff = new Date(now.getTime() - config.windowSeconds * 1000);
  const keyHash = createHash('sha256').update(`${rule}\0${identity}`).digest('hex');
  const [counter] = await db
    .insert(rateLimits)
    .values({ rule, keyHash, windowStartedAt: now, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimits.rule, rateLimits.keyHash],
      set: {
        windowStartedAt: sql`case when ${rateLimits.windowStartedAt} <= ${cutoff} then ${now} else ${rateLimits.windowStartedAt} end`,
        count: sql`case when ${rateLimits.windowStartedAt} <= ${cutoff} then 1 else ${rateLimits.count} + 1 end`,
      },
    })
    .returning({ count: rateLimits.count, windowStartedAt: rateLimits.windowStartedAt });

  if (!counter) throw new AppError('INTERNAL', 'Could not apply the rate limit.');
  if (counter.count > config.limit) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((counter.windowStartedAt.getTime() + config.windowSeconds * 1000 - now.getTime()) / 1000),
    );
    throw new AppError('RATE_LIMITED', 'Too many requests. Try again shortly.', 429, { retryAfterSeconds });
  }
}
