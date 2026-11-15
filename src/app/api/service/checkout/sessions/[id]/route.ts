import { checkoutRoute, getSessionForMerchant, serializeSession } from '@/modules/checkout';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = checkoutRoute<{ params: Promise<{ id: string }> }>(async (_request, { merchant, params }) => {
  const { id } = await params;
  const session = await getSessionForMerchant(merchant, id);
  return Response.json({ session: serializeSession(session) });
});
