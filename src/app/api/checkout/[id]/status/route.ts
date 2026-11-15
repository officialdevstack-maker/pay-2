import { AppError } from '@/lib/errors';
import { route } from '@/lib/request';
import { effectiveStatus, getActiveCheckoutAttempt, getSessionForCheckout } from '@/modules/checkout';
import { requireApiUser } from '@/modules/identity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route<{ params: Promise<{ id: string }> }>(async (_request, { params }) => {
  const user = await requireApiUser();
  const { id } = await params;
  const found = await getSessionForCheckout(id, user.id);
  if (!found) throw new AppError('CHECKOUT_NOT_FOUND', 'We could not find that checkout session.', 404);
  const attempt = await getActiveCheckoutAttempt(found.session.id, user.id);
  return Response.json(
    { status: effectiveStatus(found.session), attemptStatus: attempt?.status ?? null },
    { headers: { 'cache-control': 'no-store' } },
  );
});
