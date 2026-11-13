import { describe, expect, it } from 'vitest';
import { safeReturnTo } from './return-to';

describe('safeReturnTo', () => {
  it('keeps same-origin paths', () => {
    expect(safeReturnTo('/pay?to=1')).toBe('/pay?to=1');
    expect(safeReturnTo('/')).toBe('/');
  });

  it('rejects destinations that could leave the site or loop through auth', () => {
    for (const bad of [
      '//evil.com',
      '/\\evil.com',
      'https://evil.com/x',
      'javascript:alert(1)',
      '/auth',
      '/auth/login',
      '',
      null,
      undefined,
    ]) {
      expect(safeReturnTo(bad)).toBe('/');
    }
  });
});
