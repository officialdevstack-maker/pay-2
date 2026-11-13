import { describe, expect, it } from 'vitest';
import { mapProviderError, ProviderError } from '../errors';
import { MOCK_SIGNATURE_HEADER, mockProvider, signMockWebhook } from './index';

const body = JSON.stringify({
  id: 'evt_1',
  type: 'funding.received',
  accountNumber: '9912345678',
  amountKobo: '500000',
});

describe('mock provider', () => {
  it('verifies signatures and rejects tampering', () => {
    const good = new Headers({ [MOCK_SIGNATURE_HEADER]: signMockWebhook(body) });
    expect(mockProvider.verifyWebhook(body, good)).toBe(true);
    expect(mockProvider.verifyWebhook(body + ' ', good)).toBe(false);
    expect(mockProvider.verifyWebhook(body, new Headers())).toBe(false);
  });

  it('normalises events and ignores unknown ones', () => {
    expect(mockProvider.parseWebhook(body)).toMatchObject({ type: 'funding.received', amount: 500000n });
    expect(mockProvider.parseWebhook('{"id":"x","type":"other"}')).toBeNull();
    expect(mockProvider.parseWebhook('not json')).toBeNull();
  });

  it('maps provider errors to our own codes and hides raw detail', () => {
    const mapped = mapProviderError(new ProviderError('REJECTED', 'vendor says: do not honour'));
    expect(mapped.code).toBe('PAYOUT_FAILED');
    expect(mapped.message).not.toMatch(/vendor|honour/);
  });
});
