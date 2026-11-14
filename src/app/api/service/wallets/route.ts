import { openWallet, parseBody, readJson, serviceRoute, subBody } from '@/modules/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = serviceRoute(async (request, { caller }) => {
  const { sub } = parseBody(subBody, await readJson(request));
  return Response.json({ wallet: await openWallet(caller, sub) });
});
