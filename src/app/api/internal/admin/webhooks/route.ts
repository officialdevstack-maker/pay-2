import { listAdminWebhookEvents } from '@/modules/admin';
import { internalAdminRoute } from '@/modules/admin/internal-route';
import { parseAdminListQuery } from '@/modules/admin/query';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = internalAdminRoute(async (request) => {
  const query = parseAdminListQuery(
    new URL(request.url).searchParams,
    ['received', 'processed', 'failed'] as const,
  );
  return Response.json({ data: await listAdminWebhookEvents(query) });
});
