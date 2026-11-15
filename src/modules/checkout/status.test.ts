import { describe, expect, it } from 'vitest';
import { canStartAttempt, deriveCheckoutStatus, type CheckoutStatusInput, type PublicCheckoutStatus } from './status';

const now = new Date('2026-11-16T14:14:00+01:00');
const future = new Date(now.getTime() + 60_000);
const past = new Date(now.getTime() - 60_000);

const base: CheckoutStatusInput = {
  sessionStatus: 'open',
  expiresAt: future,
  latestAttemptStatus: null,
  reversed: false,
  now,
};
const make = (overrides: Partial<CheckoutStatusInput>): CheckoutStatusInput => ({ ...base, ...overrides });

const cases: Array<[Partial<CheckoutStatusInput>, PublicCheckoutStatus]> = [
  [{}, 'open'],
  [{ expiresAt: past }, 'expired'],
  [{ latestAttemptStatus: 'pending' }, 'pending'],
  [{ latestAttemptStatus: 'unknown' }, 'pending'],
  [{ latestAttemptStatus: 'pending', expiresAt: past }, 'pending'],
  [{ latestAttemptStatus: 'failed' }, 'open'],
  [{ latestAttemptStatus: 'failed', expiresAt: past }, 'expired'],
  [{ sessionStatus: 'paid', latestAttemptStatus: 'succeeded' }, 'paid'],
  [{ sessionStatus: 'paid', reversed: true }, 'reversed'],
  [{ sessionStatus: 'cancelled' }, 'cancelled'],
  [{ sessionStatus: 'expired' }, 'expired'],
];

describe('deriveCheckoutStatus', () => {
  it.each(cases)('%j -> %s', (overrides, expected) => {
    expect(deriveCheckoutStatus(make(overrides))).toBe(expected);
  });

  it('allows a new attempt only when the checkout is open', () => {
    expect(canStartAttempt(make({}))).toBe(true);
    expect(canStartAttempt(make({ latestAttemptStatus: 'unknown' }))).toBe(false);
    expect(canStartAttempt(make({ latestAttemptStatus: 'failed' }))).toBe(true);
    expect(canStartAttempt(make({ expiresAt: past }))).toBe(false);
  });
});
