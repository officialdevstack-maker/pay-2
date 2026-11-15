import { assertSameOrigin } from '@/lib/csrf';
import { rateLimit } from '@/lib/rate-limit';
import { route } from '@/lib/request';
import { parseAttemptKey, startBankTransfer } from '@/modules/checkout';
import { requireMoneyUser } from '@/modules/identity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route<{ params: Promise<{ id: string }> }>(async (request, { params }) => {
  assertSameOrigin(request);
  const user = await requireMoneyUser();
  await rateLimit('checkout_pay', user.id);
  const { id } = await params;
  const idempotencyKey = parseAttemptKey(request.headers.get('idempotency-key'));
  const transfer = await startBankTransfer(id, user.id, idempotencyKey);
  return Response.json({ transfer }, { headers: { 'cache-control': 'no-store' } });
});
