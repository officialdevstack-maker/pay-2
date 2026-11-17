import { z } from 'zod';
import { AppError } from '@/lib/errors';
import { getAdminMerchant } from '@/modules/admin';
import { internalAdminRoute } from '@/modules/admin/internal-route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = internalAdminRoute(async (request) => {
  const id = new URL(request.url).pathname.split('/').at(-1) ?? '';
  if (!z.uuid().safeParse(id).success) throw new AppError('NOT_FOUND', 'Merchant not found.', 404);
  const merchant = await getAdminMerchant(id);
  if (!merchant) throw new AppError('NOT_FOUND', 'Merchant not found.', 404);
  return Response.json({ merchant });
});
