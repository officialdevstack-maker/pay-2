import { internalAdminRoute, internalAdminWriteRoute } from '@/modules/admin/internal-route';
import {
  createMerchantWebhook,
  getMerchantWebhook,
  updateMerchantWebhook,
} from '@/modules/merchant-webhooks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function merchantId(request: Request) {
  return new URL(request.url).pathname.split('/').at(-2) ?? '';
}

export const GET = internalAdminRoute(async (request) => {
  return Response.json(await getMerchantWebhook(merchantId(request)));
});

export const POST = internalAdminWriteRoute('pay.write', async (request, { admin, audit }) => {
  const values = await request.json().catch(() => null);
  return Response.json(
    await createMerchantWebhook(merchantId(request), values, admin, audit),
    { status: 201 },
  );
});

export const PUT = internalAdminWriteRoute('pay.write', async (request, { admin, audit }) => {
  const values = await request.json().catch(() => null);
  return Response.json(await updateMerchantWebhook(merchantId(request), values, admin, audit));
});
