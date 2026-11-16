import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { env } from '@/env';
import { AppError } from '@/lib/errors';
import { rateLimit } from '@/lib/rate-limit';
import { route } from '@/lib/request';

function matchesSecret(expected: string, supplied: string | null) {
  if (!supplied) return false;
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return (
    expectedBytes.length === suppliedBytes.length &&
    timingSafeEqual(expectedBytes, suppliedBytes)
  );
}

export function internalAdminRoute(
  handler: (request: Request) => Promise<Response> | Response,
) {
  return route(async (request) => {
    const secret = env.INTERNAL_SHARED_SECRET.trim();
    if (!secret) {
      throw new AppError(
        'SERVICE_UNAVAILABLE',
        'The internal admin API is not configured.',
        503,
      );
    }
    if (!matchesSecret(secret, request.headers.get('x-internal-secret'))) {
      throw new AppError('FORBIDDEN', 'Internal admin access denied.', 403);
    }

    await rateLimit('internal_admin', 'admin-panel');
    const response = await handler(request);
    response.headers.set('cache-control', 'no-store');
    return response;
  });
}
