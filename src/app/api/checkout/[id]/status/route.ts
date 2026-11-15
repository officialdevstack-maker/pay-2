import { AppError } from '@/lib/errors';
import { route } from '@/lib/request';
import { effectiveStatus, getSessionForCheckout } from '@/modules/checkout';
import { requireApiUser } from '@/modules/identity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route<{ params: Promise<{ id: string }> }>(async (_request, { params }) => {
  await requireApiUser();
  const { id } = await params;
  const found = await getSessionForCheckout(id);
  if (!found) throw new AppError('CHECKOUT_NOT_FOUND', 'We could not find that checkout session.', 404);
  return Response.json(
    { status: effectiveStatus(found.session) },
    { headers: { 'cache-control': 'no-store' } },
  );
});
