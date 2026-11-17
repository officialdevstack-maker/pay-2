import { timingSafeEqual } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { env } from '@/env';
import { AppError } from '@/lib/errors';
import { route } from '@/lib/request';
import '@/modules/checkout/register';
import { expireStaleAttempts } from '@/modules/checkout';
import { deliverMerchantWebhooks } from '@/modules/merchant-webhooks/delivery';
import { enqueueExpiredCheckoutEvents } from '@/modules/merchant-webhooks';
import { processPendingEvents } from '@/modules/payments';
import { db } from '@/server/db/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorised(request: Request): boolean {
  const expected = env.CRON_SECRET;
  if (!expected) return false;
  const given = request.headers.get('authorization') ?? '';
  const a = Buffer.from(given);
  const b = Buffer.from(`Bearer ${expected}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const GET = route(async (request) => {
  if (!authorised(request)) throw new AppError('NOT_FOUND', 'Not found.', 404);

  const expired = await expireStaleAttempts(50);
  const expiredEvents = await enqueueExpiredCheckoutEvents(50);
  const merchantWebhooks = await deliverMerchantWebhooks(50);
  const processed = await processPendingEvents(50);
  await db.execute(sql`delete from rate_limits where window_started_at < now() - interval '1 day'`);
  return Response.json({ ok: true, processed, expired, expiredEvents, merchantWebhooks });
});
