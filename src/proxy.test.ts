import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { proxy } from './proxy';

describe('proxy', () => {
  it.each([
    '/api/internal/admin/stats',
    '/api/webhooks/provider',
    '/api/cron/maintenance',
    '/api/merchant/checkout-sessions/SPY_ABCDEFGHJKMNPQRS',
    '/api/service/checkout/sessions',
  ])('lets %s reach its own auth guard', (path) => {
    const response = proxy(new NextRequest(`https://pay.test${path}`));
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it.each(['/api/me/tag', '/api/checkout/abc/status'])(
    'continues to require a customer session for %s',
    (path) => {
      const response = proxy(new NextRequest(`https://pay.test${path}`));
      expect(response.status).toBe(401);
    },
  );
});
