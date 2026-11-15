import { describe, expect, it } from 'vitest';
import { isBrandSafe } from './brand';

describe('isBrandSafe', () => {
  it('allows neutral names and refuses vendor names', () => {
    expect(isBrandSafe('Sample Bank One')).toBe(true);
    expect(isBrandSafe('Spurs Pay Spurs Store')).toBe(true);
    expect(isBrandSafe('Paystack Titan')).toBe(false);
    expect(isBrandSafe('FLW account')).toBe(false);
  });
});
