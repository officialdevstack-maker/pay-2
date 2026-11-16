import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { proxy } from './proxy';

describe('proxy', () => {
  it('lets server-to-server internal APIs reach their shared-secret guard', () => {
    const response = proxy(new NextRequest('https://pay.test/api/internal/admin/stats'));
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('continues to require a customer session for private APIs', () => {
    const response = proxy(new NextRequest('https://pay.test/api/me/tag'));
    expect(response.status).toBe(401);
  });
});
