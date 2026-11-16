import { AppError } from '@/lib/errors';
import { route } from '@/lib/request';
import '@/modules/checkout/register';
import { ingestWebhook } from '@/modules/payments';
import { verifyProviderWebhookToken } from '@/server/admin-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route(async (request) => {
  const url = new URL(request.url);
  const provider = url.searchParams.get('provider') ?? '';
  const token = url.searchParams.get('token') ?? '';
  if (!provider || !token || !(await verifyProviderWebhookToken(provider, token))) {
    throw new AppError('NOT_FOUND', 'Not found.', 404);
  }

  await ingestWebhook(await request.text(), request.headers);
  return Response.json({ ok: true });
});
