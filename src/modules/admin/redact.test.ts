import { describe, expect, it } from 'vitest';
import { redactAdminError } from './redact';

describe('redactAdminError', () => {
  it('removes sensitive labeled values and full account-like numbers', () => {
    const value = redactAdminError(
      'provider failed: {"pan":"4111111111111111","cvv":"123","account_number":"0123456789","merchant_secret":"sensitive"}',
    );
    expect(value).not.toContain('4111111111111111');
    expect(value).not.toContain('"123"');
    expect(value).not.toContain('0123456789');
    expect(value).not.toContain('sensitive');
    expect(value).toContain('[REDACTED]');
  });

  it('keeps safe error text and handles missing errors', () => {
    expect(redactAdminError('temporarily unavailable')).toBe('temporarily unavailable');
    expect(redactAdminError(null)).toBeNull();
  });
});
