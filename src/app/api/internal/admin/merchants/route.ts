import { listAdminMerchants } from '@/modules/admin';
import { internalAdminRoute, internalAdminWriteRoute } from '@/modules/admin/internal-route';
import { parseAdminListQuery } from '@/modules/admin/query';
import { AppError } from '@/lib/errors';
import { createMerchant, createMerchantInput } from '@/modules/merchants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = internalAdminRoute(async (request) => {
  const query = parseAdminListQuery(
    new URL(request.url).searchParams,
    ['pending', 'active', 'suspended'] as const,
  );
  return Response.json({ data: await listAdminMerchants(query) });
});

export const POST = internalAdminWriteRoute('pay.write', async (request, { admin, audit }) => {
  const parsed = createMerchantInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    throw new AppError('VALIDATION_FAILED', parsed.error.issues[0]?.message ?? 'Invalid request.', 422);
  }
  return Response.json({ merchant: await createMerchant(parsed.data, admin, audit) }, { status: 201 });
});
