import { describe, expect, it } from 'vitest';
import { isNavActive, NAV } from './nav';

const item = (label: string) => NAV.find((entry) => entry.label === label)!;

describe('isNavActive', () => {
  it('matches Home only on /', () => {
    expect(isNavActive('/', item('Home'))).toBe(true);
    expect(isNavActive('/activity', item('Home'))).toBe(false);
  });

  it('matches sub-routes but not look-alike prefixes', () => {
    expect(isNavActive('/activity', item('Activity'))).toBe(true);
    expect(isNavActive('/activity/SPY_8K2M4Q7X1ZA9B3CD', item('Activity'))).toBe(true);
    expect(isNavActive('/activityx', item('Activity'))).toBe(false);
  });

  it('matches payment methods route and its subpaths', () => {
    expect(isNavActive('/payment-methods', item('Payment methods'))).toBe(true);
    expect(isNavActive('/payment-methods/add', item('Payment methods'))).toBe(true);
  });
});
