import { assertSameOrigin } from '@/lib/csrf';
import { AppError } from '@/lib/errors';
import { route } from '@/lib/request';
import { requireMoneyUser } from '@/modules/identity';
import { parseSendRequest, sendMoney, serializeSend } from '@/modules/transfers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route(async (request) => {
  assertSameOrigin(request);
  const user = await requireMoneyUser();
  const raw = await request.json().catch(() => {
    throw new AppError('BAD_REQUEST', 'Invalid request.', 400);
  });
  const input = parseSendRequest(raw, request.headers.get('idempotency-key'));
  const result = await sendMoney(
    { id: user.id, name: user.name ?? null },
    input,
    { ip: request.headers.get('x-real-ip') ?? undefined },
  );
  return Response.json(serializeSend(result), {
    status: result.replayed ? 200 : 201,
    headers: { 'cache-control': 'no-store' },
  });
});
