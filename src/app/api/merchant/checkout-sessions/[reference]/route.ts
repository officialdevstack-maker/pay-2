import { checkoutRoute, getCheckoutStatus, getSessionForMerchantByReference, serializeMerchantStatus } from '@/modules/checkout';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = checkoutRoute<{ params: Promise<{ reference: string }> }>(async (_request, { merchant, params }) => {
  const { reference } = await params;
  const session = await getSessionForMerchantByReference(merchant, reference);
  const status = await getCheckoutStatus(session);
  return Response.json(serializeMerchantStatus(session, status));
});
