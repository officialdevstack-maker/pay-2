import { AppError } from '@/lib/errors';
import { checkoutRoute, createSession, parseCreateSession, serializeSession } from '@/modules/checkout';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = checkoutRoute(async (request, { merchant }) => {
  const raw = await request.json().catch(() => {
    throw new AppError('BAD_REQUEST', 'Invalid request.', 400);
  });
  const input = parseCreateSession(raw, request.headers.get('idempotency-key'));
  const { session, replayed } = await createSession(merchant, input);
  return Response.json({ session: serializeSession(session) }, { status: replayed ? 200 : 201 });
});
