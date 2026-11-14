import { parseBody, pinBody, readJson, serviceRoute, verifyWalletPin } from '@/modules/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = serviceRoute(async (request, { caller }) => {
  const { sub, pin } = parseBody(pinBody, await readJson(request));
  await verifyWalletPin(caller, sub, pin);
  return Response.json({ verified: true });
});
