import { route } from '@/lib/request';
import { requireApiUser } from '@/modules/identity';
import { listRecentRecipients } from '@/modules/transfers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(async (request) => {
  const user = await requireApiUser();
  const query = new URL(request.url).searchParams.get('q');
  const recipients = await listRecentRecipients(user.id, {
    query,
    ip: request.headers.get('x-real-ip') ?? undefined,
  });
  return Response.json({ recipients }, { headers: { 'cache-control': 'no-store' } });
});
