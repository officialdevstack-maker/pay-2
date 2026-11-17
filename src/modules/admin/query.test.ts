import { describe, expect, it } from 'vitest';
import {
  decodeAdminCheckoutCursor,
  encodeAdminCheckoutCursor,
  parseAdminCheckoutsQuery,
  parseAdminListQuery,
  parseAdminSuspenseQuery,
} from './query';

describe('parseAdminCheckoutsQuery', () => {
  it('uses a bounded default and accepts known filters', () => {
    expect(parseAdminCheckoutsQuery(new URLSearchParams())).toEqual({
      limit: 50,
      status: null,
      merchant: null,
      from: null,
      to: null,
      reference: null,
      cursor: null,
    });
    expect(
      parseAdminCheckoutsQuery(new URLSearchParams('limit=100&status=paid')),
    ).toMatchObject({ limit: 100, status: 'paid' });
  });

  it('parses filters and round-trips the stable cursor', () => {
    const cursor = { createdAt: new Date('2026-01-02T03:04:05.000Z'), reference: 'SPY_1234567890ABCDEF' };
    const encoded = encodeAdminCheckoutCursor(cursor);
    expect(decodeAdminCheckoutCursor(encoded)).toEqual(cursor);
    expect(
      parseAdminCheckoutsQuery(
        new URLSearchParams(
          `merchant=Shop&from=2026-01-01&to=2026-01-31&reference=SPY&cursor=${encoded}`,
        ),
      ),
    ).toMatchObject({
      merchant: 'Shop',
      reference: 'SPY',
      cursor,
    });
  });

  it('rejects invalid limits and statuses', () => {
    expect(() => parseAdminCheckoutsQuery(new URLSearchParams('limit=101'))).toThrow(
      /Limit must be an integer/,
    );
    expect(() => parseAdminCheckoutsQuery(new URLSearchParams('status=pending'))).toThrow(
      /Status is not supported/,
    );
    expect(() => parseAdminCheckoutsQuery(new URLSearchParams('from=invalid'))).toThrow(
      /from must be a valid date/,
    );
    expect(() => parseAdminCheckoutsQuery(new URLSearchParams('from=2026-02-01&to=2026-01-01'))).toThrow(
      /from must be earlier/,
    );
    expect(() => parseAdminCheckoutsQuery(new URLSearchParams('cursor=not-valid'))).toThrow(
      /Cursor is not valid/,
    );
  });
});

describe('admin list query parsers', () => {
  it('validates merchant and webhook status filters', () => {
    expect(parseAdminListQuery(new URLSearchParams('status=active'), ['active', 'suspended'] as const))
      .toMatchObject({ status: 'active', limit: 50 });
    expect(() => parseAdminListQuery(new URLSearchParams('status=failed'), ['active', 'suspended'] as const))
      .toThrow(/Status is not supported/);
  });

  it('accepts only positive integer suspense cursors', () => {
    expect(parseAdminSuspenseQuery(new URLSearchParams('cursor=123'))).toEqual({
      limit: 50,
      cursor: 123n,
    });
    expect(() => parseAdminSuspenseQuery(new URLSearchParams('cursor=1.5'))).toThrow(
      /Cursor is not valid/,
    );
  });
});
