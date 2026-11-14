import {
  parseBody,
  parseIdempotencyKey,
  readJson,
  serviceRoute,
  transferBody,
  transferFunds,
} from '@/modules/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = serviceRoute(async (request, { caller }) => {
  const idempotencyKey = parseIdempotencyKey(request.headers.get('idempotency-key'));
  const body = parseBody(transferBody, await readJson(request));
  const { transfer, replayed } = await transferFunds(caller, {
    fromSub: body.fromSub,
    toSub: body.toSub,
    amount: BigInt(body.amountKobo),
    note: body.note,
    pin: body.pin,
    idempotencyKey,
  });
  return Response.json({ transfer }, { status: replayed ? 200 : 201 });
});
