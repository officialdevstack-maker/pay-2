import { getAdminCheckout } from '@/modules/admin';
import { internalAdminRoute } from '@/modules/admin/internal-route';
import { AppError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = internalAdminRoute(async (request) => {
  const reference = new URL(request.url).pathname.split('/').at(-1) ?? '';
  if (!/^SPY_[A-Z0-9]{16}$/.test(reference)) {
    throw new AppError('NOT_FOUND', 'Checkout not found.', 404);
  }
  const checkout = await getAdminCheckout(reference);
  if (!checkout) throw new AppError('NOT_FOUND', 'Checkout not found.', 404);
  return Response.json(checkout);
});
