import 'server-only';
import { env } from '@/env';
import { AppError } from './errors';

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get('origin');
  const expected = new URL(env.APP_URL).origin;
  const ok = origin ? origin === expected : request.headers.get('sec-fetch-site') === 'same-origin';
  if (!ok) throw new AppError('FORBIDDEN', 'Request not allowed.', 403);
}
