import { listAdminCheckouts } from '@/modules/admin';
import { internalAdminRoute } from '@/modules/admin/internal-route';
import { parseAdminCheckoutsQuery } from '@/modules/admin/query';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = internalAdminRoute(async (request) => {
  const filters = parseAdminCheckoutsQuery(
    new URL(request.url).searchParams,
  );
  return Response.json(await listAdminCheckouts(filters));
});
