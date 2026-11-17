import { listAdminSuspenseEntries } from '@/modules/admin';
import { internalAdminRoute } from '@/modules/admin/internal-route';
import { parseAdminSuspenseQuery } from '@/modules/admin/query';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = internalAdminRoute(async (request) => {
  const query = parseAdminSuspenseQuery(new URL(request.url).searchParams);
  return Response.json(await listAdminSuspenseEntries(query));
});
