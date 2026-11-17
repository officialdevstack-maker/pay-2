import { internalAdminWriteRoute } from '@/modules/admin/internal-route';
import { rotateMerchantWebhookSecret } from '@/modules/merchant-webhooks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = internalAdminWriteRoute('pay.approve', async (request, { admin, audit }) => {
  const merchantId = new URL(request.url).pathname.split('/').at(-3) ?? '';
  return Response.json(await rotateMerchantWebhookSecret(merchantId, admin, audit));
});
