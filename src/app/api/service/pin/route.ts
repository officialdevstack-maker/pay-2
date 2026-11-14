import { parseBody, pinBody, readJson, serviceRoute, setWalletPin } from '@/modules/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = serviceRoute(async (request, { caller }) => {
  const { sub, pin } = parseBody(pinBody, await readJson(request));
  await setWalletPin(caller, sub, pin);
  return Response.json({ ok: true }, { status: 201 });
});
