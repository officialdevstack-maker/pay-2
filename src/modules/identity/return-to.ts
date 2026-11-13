import { env } from '@/env';

export function safeReturnTo(value: string | null | undefined): string {
  if (!value || value.length > 512) return '/';
  try {
    const appUrl = new URL(env.APP_URL);
    const destination = new URL(value, appUrl);
    if (destination.origin !== appUrl.origin) return '/';
    if (destination.pathname === '/auth' || destination.pathname.startsWith('/auth/')) return '/';
    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return '/';
  }
}
