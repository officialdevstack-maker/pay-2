import { internalAdminRoute, internalAdminWriteRoute } from '@/modules/admin/internal-route';
import { getMerchantOnboarding, updateMerchantOnboarding } from '@/modules/merchant-webhooks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function merchantId(request: Request) {
  return new URL(request.url).pathname.split('/').at(-2) ?? '';
}

export const GET = internalAdminRoute(async (request) => {
  return Response.json(await getMerchantOnboarding(merchantId(request)));
});

export const PUT = internalAdminWriteRoute('pay.write', async (request, { admin, audit }) => {
  const values = await request.json().catch(() => null);
  return Response.json(await updateMerchantOnboarding(merchantId(request), values, admin, audit));
});
