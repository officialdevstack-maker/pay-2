import { describe, expect, it } from 'vitest';
import { parseSendRequest } from './input';

const key = 'intent-0123456789abcdef';
const valid = { recipient: '@ada', amount: '1,250.50', note: '  lunch\n money ', pin: '1234' };

describe('parseSendRequest', () => {
  it('parses Naira into kobo and cleans the note', () => {
    expect(parseSendRequest(valid, key)).toMatchObject({
      recipientTag: '@ada',
      amount: 125050n,
      note: 'lunch money',
      idempotencyKey: key,
    });
  });

  it('turns a blank note into null', () => {
    expect(parseSendRequest({ ...valid, note: '   ' }, key).note).toBeNull();
  });

  it('rejects missing or malformed idempotency keys', () => {
    for (const bad of [null, '', 'short', 'has spaces in it for sure']) {
      expect(() => parseSendRequest(valid, bad)).toThrow(/Idempotency-Key/);
    }
  });

  it('rejects invalid or zero amounts', () => {
    for (const amount of ['0', '0.00', 'abc', '-5', '1.234']) {
      expect(() => parseSendRequest({ ...valid, amount }, key)).toThrow();
    }
  });

  it('rejects a missing PIN or recipient', () => {
    expect(() => parseSendRequest({ ...valid, pin: undefined }, key)).toThrow();
    expect(() => parseSendRequest({ ...valid, recipient: '' }, key)).toThrow();
  });
});
