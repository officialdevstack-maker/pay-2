import { describe, expect, it } from 'vitest';
import { requestHash, validateEntries, validatePostInput } from './validate';

const a = '00000000-0000-0000-0000-00000000000a';
const b = '00000000-0000-0000-0000-00000000000b';

describe('validateEntries', () => {
  it('accepts a balanced pair', () => {
    expect(() =>
      validateEntries([
        { accountId: a, direction: 'debit', amount: 100n },
        { accountId: b, direction: 'credit', amount: 100n },
      ]),
    ).not.toThrow();
  });

  it('rejects unbalanced, non-positive and single-entry transactions', () => {
    expect(() =>
      validateEntries([
        { accountId: a, direction: 'debit', amount: 100n },
        { accountId: b, direction: 'credit', amount: 99n },
      ]),
    ).toThrow(/Debits must equal credits/);
    expect(() =>
      validateEntries([
        { accountId: a, direction: 'debit', amount: 0n },
        { accountId: b, direction: 'credit', amount: 0n },
      ]),
    ).toThrow(/positive/);
    expect(() => validateEntries([{ accountId: a, direction: 'debit', amount: 1n }])).toThrow(/two entries/);
  });
});

describe('requestHash', () => {
  const base = {
    type: 'transfer',
    entries: [
      { accountId: a, direction: 'debit', amount: 100n },
      { accountId: b, direction: 'credit', amount: 100n },
    ],
  } as const;

  it('ignores entry order but not content', () => {
    expect(requestHash(base)).toBe(requestHash({ ...base, entries: [...base.entries].reverse() }));
    expect(requestHash(base)).not.toBe(
      requestHash({
        ...base,
        entries: [
          { accountId: a, direction: 'debit', amount: 101n },
          { accountId: b, direction: 'credit', amount: 101n },
        ],
      }),
    );
  });

  it('includes currency, type, reversal, and metadata in the idempotency hash', () => {
    expect(requestHash(base)).not.toBe(requestHash({ ...base, type: 'funding' }));
    expect(requestHash(base)).not.toBe(requestHash({ ...base, currency: 'USD' }));
    expect(requestHash({ ...base, metadata: { note: 'one' } })).not.toBe(
      requestHash({ ...base, metadata: { note: 'two' } }),
    );
    expect(
      requestHash({ ...base, metadata: { note: 'one', channel: 'app' } }),
    ).toBe(requestHash({ ...base, metadata: { channel: 'app', note: 'one' } }));
  });
});

describe('validatePostInput', () => {
  it('requires a valid scoped idempotency key and supported currency', () => {
    const valid = {
      type: 'transfer',
      idempotency: { scope: 'user:1', key: 'intent-1' },
      entries: [
        { accountId: a, direction: 'debit' as const, amount: 1n },
        { accountId: b, direction: 'credit' as const, amount: 1n },
      ],
    };
    expect(() => validatePostInput(valid)).not.toThrow();
    expect(() =>
      validatePostInput({ ...valid, idempotency: { scope: '', key: 'intent-1' } }),
    ).toThrow(/idempotency/i);
    expect(() => validatePostInput({ ...valid, currency: 'USD' })).toThrow(/currency/i);
    expect(() =>
      validatePostInput({ ...valid, metadata: { amount: Number.NaN } }),
    ).toThrow(/metadata/i);
  });
});
