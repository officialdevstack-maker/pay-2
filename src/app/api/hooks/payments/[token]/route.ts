import { timingSafeEqual } from 'node:crypto';
import { env } from '@/env';
import { AppError } from '@/lib/errors';
import { route } from '@/lib/request';
import { ingestWebhook } from '@/modules/payments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function tokenMatches(given: string): boolean {
  const expected = env.PAYMENTS_WEBHOOK_TOKEN;
  if (!expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const POST = route<{ params: Promise<{ token: string }> }>(async (request, { params }) => {
  const { token } = await params;
  if (!tokenMatches(token)) throw new AppError('NOT_FOUND', 'Not found.', 404);

  await ingestWebhook(await request.text(), request.headers);
  return Response.json({ ok: true });
});
