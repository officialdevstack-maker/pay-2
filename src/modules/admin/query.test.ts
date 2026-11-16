import { describe, expect, it } from 'vitest';
import { parseAdminCheckoutsQuery } from './query';

describe('parseAdminCheckoutsQuery', () => {
  it('uses a bounded default and accepts known filters', () => {
    expect(parseAdminCheckoutsQuery(new URLSearchParams())).toEqual({
      limit: 50,
      status: null,
    });
    expect(
      parseAdminCheckoutsQuery(new URLSearchParams('limit=100&status=paid')),
    ).toEqual({ limit: 100, status: 'paid' });
  });

  it('rejects invalid limits and statuses', () => {
    expect(() => parseAdminCheckoutsQuery(new URLSearchParams('limit=101'))).toThrow(
      /Limit must be an integer/,
    );
    expect(() => parseAdminCheckoutsQuery(new URLSearchParams('status=pending'))).toThrow(
      /Status is not supported/,
    );
  });
});
