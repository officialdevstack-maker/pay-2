import { AppError } from '@/lib/errors';
import { checkoutRoute, createSession, getCheckoutStatus, parseCreateSession, serializeSession } from '@/modules/checkout';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = checkoutRoute(async (request, { merchant }) => {
  const raw = await request.json().catch(() => {
    throw new AppError('BAD_REQUEST', 'Invalid request.', 400);
  });
  const input = await parseCreateSession(raw, request.headers.get('idempotency-key'));
  const { session, replayed } = await createSession(merchant, input);
  const status = await getCheckoutStatus(session);
  return Response.json({ session: serializeSession(session, status) }, { status: replayed ? 200 : 201 });
});
