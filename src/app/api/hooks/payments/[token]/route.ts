import { timingSafeEqual } from 'node:crypto';
import { env } from '@/env';
import { AppError } from '@/lib/errors';
import { route } from '@/lib/request';
import '@/modules/checkout/register';
import { ingestWebhook } from '@/modules/payments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function tokenMatches(given: string): boolean {
  const expected = env.PAYMENTS_WEBHOOK_TOKEN;
  if (!expected) return false;
  const provided = Buffer.from(given);
  const configured = Buffer.from(expected);
  return provided.length === configured.length && timingSafeEqual(provided, configured);
}

export const POST = route<{ params: Promise<{ token: string }> }>(async (request, { params }) => {
  const { token } = await params;
  if (!tokenMatches(token)) throw new AppError('NOT_FOUND', 'Not found.', 404);

  await ingestWebhook(await request.text(), request.headers);
  return Response.json({ ok: true });
});
