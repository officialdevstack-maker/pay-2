import { z } from 'zod';
import { CHECKOUT } from '@/config/checkout';
import { AppError } from '@/lib/errors';
import type { CreateSessionInput } from './types';

const createBody = z.strictObject({
  amountKobo: z.string().regex(/^[1-9]\d{0,14}$/, 'Amount must be whole kobo above zero.'),
  merchantReference: z.string().regex(/^[A-Za-z0-9._:-]{1,64}$/, 'Invalid merchant reference.'),
  description: z.string().trim().max(120).nullish(),
});

const KEY = /^[A-Za-z0-9_-]{16,128}$/;

export const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseAttemptKey(idempotencyKey: string | null): string {
  if (!idempotencyKey || !KEY.test(idempotencyKey)) {
    throw new AppError('BAD_REQUEST', 'A valid Idempotency-Key header is required.', 400);
  }
  return idempotencyKey;
}

export function parseCreateSession(raw: unknown, idempotencyKey: string | null): CreateSessionInput {
  const parsedIdempotencyKey = parseAttemptKey(idempotencyKey);

  const parsed = createBody.safeParse(raw);
  if (!parsed.success) {
    const fields = [
      ...new Set(
        parsed.error.issues.flatMap((issue) =>
          'keys' in issue ? issue.keys : [String(issue.path[0] ?? 'body')],
        ),
      ),
    ];
    throw new AppError('VALIDATION_FAILED', 'Check the details and try again.', 422, { fields });
  }

  const amount = BigInt(parsed.data.amountKobo);
  if (amount > CHECKOUT.maxAmountKobo) {
    throw new AppError('VALIDATION_FAILED', 'This amount is above the checkout limit.', 422, {
      fields: ['amountKobo'],
    });
  }

  return {
    amount,
    merchantReference: parsed.data.merchantReference,
    description: parsed.data.description?.trim() || null,
    idempotencyKey: parsedIdempotencyKey,
  };
}
