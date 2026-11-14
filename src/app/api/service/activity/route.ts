import { listActivity, parseActivityQuery, serviceRoute } from '@/modules/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = serviceRoute(async (request, { caller }) => {
  const { sub, cursor, limit } = parseActivityQuery(new URL(request.url).searchParams);
  return Response.json(await listActivity(caller, sub, { cursor, limit }));
});
