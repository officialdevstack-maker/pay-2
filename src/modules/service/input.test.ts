import { describe, expect, it } from 'vitest';
import { parseActivityQuery, parseBody, parseIdempotencyKey, transferBody } from './input';

const valid = { fromSub: 'u-1', toSub: 'u-2', amountKobo: '125050', note: null, pin: '1234' };

describe('service input', () => {
  it('accepts a well-formed transfer', () => {
    expect(parseBody(transferBody, valid).amountKobo).toBe('125050');
  });

  it('never accepts a product from the request body', () => {
    expect(() => parseBody(transferBody, { ...valid, product: 'pay' })).toThrow(/Check the details/);
  });

  it('rejects zero, negative, decimal and padded amounts', () => {
    for (const amountKobo of ['0', '-5', '1.5', '007', '', '1'.repeat(16)]) {
      expect(() => parseBody(transferBody, { ...valid, amountKobo })).toThrow();
    }
  });

  it('requires a well-formed idempotency key', () => {
    expect(() => parseIdempotencyKey(null)).toThrow(/Idempotency-Key/);
    expect(() => parseIdempotencyKey('short')).toThrow(/Idempotency-Key/);
    expect(parseIdempotencyKey('intent-0123456789abcdef')).toBe('intent-0123456789abcdef');
  });

  it('bounds activity paging', () => {
    const q = (s: string) => parseActivityQuery(new URLSearchParams(s));
    expect(q('sub=u1')).toEqual({ sub: 'u1', cursor: null, limit: 20 });
    expect(q('sub=u1&limit=999').limit).toBe(50);
    expect(q('sub=u1&cursor=42').cursor).toBe(42n);
    expect(() => q('sub=u1&cursor=abc')).toThrow();
    expect(() => q('limit=5')).toThrow();
  });
});
