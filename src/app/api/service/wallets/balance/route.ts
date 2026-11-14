import { getWalletBalance, parseSub, serviceRoute } from '@/modules/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = serviceRoute(async (request, { caller }) => {
  const sub = parseSub(new URL(request.url).searchParams.get('sub'));
  return Response.json({ wallet: await getWalletBalance(caller, sub) });
});
