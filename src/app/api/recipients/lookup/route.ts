import { route } from '@/lib/request';
import { requireApiUser } from '@/modules/identity';
import { lookupRecipient } from '@/modules/transfers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(async (request) => {
  const user = await requireApiUser();
  const tag = new URL(request.url).searchParams.get('tag') ?? '';
  const recipient = await lookupRecipient(user.id, tag, request.headers.get('x-real-ip') ?? undefined);
  return Response.json({ recipient }, { headers: { 'cache-control': 'no-store' } });
});
