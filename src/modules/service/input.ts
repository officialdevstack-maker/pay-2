import { z } from 'zod';
import { SERVICE_API } from '@/config/service';
import { AppError } from '@/lib/errors';

const sub = z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/, 'Invalid user reference.');
const pin = z.string().min(1).max(32);
const KEY = /^[A-Za-z0-9_-]{16,128}$/;

// strictObject: unknown keys are rejected, so a caller can never smuggle in `product`.
export const subBody = z.strictObject({ sub });
export const pinBody = z.strictObject({ sub, pin });
export const transferBody = z.strictObject({
  fromSub: sub,
  toSub: sub,
  amountKobo: z.string().regex(/^[1-9]\d{0,14}$/, 'Amount must be whole kobo above zero.'),
  note: z.string().max(200).nullish(),
  pin,
});

const invalid = (message: string, fields?: string[]) =>
  new AppError('VALIDATION_FAILED', message, 422, fields ? { fields } : undefined);

export async function readJson(request: Request): Promise<unknown> {
  return request.json().catch(() => {
    throw new AppError('BAD_REQUEST', 'Invalid request.', 400);
  });
}

export function parseBody<S extends z.ZodType>(schema: S, raw: unknown): z.output<S> {
  const parsed = schema.safeParse(raw);
  if (parsed.success) return parsed.data;
  const fields = [
    ...new Set(
      parsed.error.issues.flatMap((issue) =>
        'keys' in issue ? issue.keys : [String(issue.path[0] ?? 'body')],
      ),
    ),
  ];
  throw invalid('Check the details and try again.', fields);
}

export function parseIdempotencyKey(value: string | null): string {
  if (!value || !KEY.test(value)) {
    throw new AppError('BAD_REQUEST', 'A valid Idempotency-Key header is required.', 400);
  }
  return value;
}

export function parseSub(value: string | null): string {
  const parsed = sub.safeParse(value);
  if (!parsed.success) throw invalid('Provide a valid sub.', ['sub']);
  return parsed.data;
}

export function parseActivityQuery(params: URLSearchParams) {
  const cursorRaw = params.get('cursor');
  if (cursorRaw !== null && !/^\d{1,18}$/.test(cursorRaw)) throw invalid('Invalid cursor.', ['cursor']);
  const limitRaw = params.get('limit');
  if (limitRaw !== null && !/^\d{1,3}$/.test(limitRaw)) throw invalid('Invalid limit.', ['limit']);
  const { default: fallback, max } = SERVICE_API.activityPageSize;
  return {
    sub: parseSub(params.get('sub')),
    cursor: cursorRaw === null ? null : BigInt(cursorRaw),
    limit: limitRaw === null ? fallback : Math.min(Math.max(Number(limitRaw), 1), max),
  };
}
