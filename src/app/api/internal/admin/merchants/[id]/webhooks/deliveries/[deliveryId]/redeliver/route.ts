import { internalAdminWriteRoute } from '@/modules/admin/internal-route';
import { redeliverMerchantWebhook } from '@/modules/merchant-webhooks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = internalAdminWriteRoute('pay.write', async (request, { admin, audit }) => {
  const path = new URL(request.url).pathname.split('/');
  const merchantId = path.at(-5) ?? '';
  const deliveryId = path.at(-2) ?? '';
  return Response.json(await redeliverMerchantWebhook(merchantId, deliveryId, admin, audit));
});
