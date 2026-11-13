import { describe, expect, it } from 'vitest';
import { requestHash, validateEntries } from './validate';

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
  const base = { type: 'transfer', entries: [
    { accountId: a, direction: 'debit', amount: 100n },
    { accountId: b, direction: 'credit', amount: 100n },
  ] } as const;

  it('ignores entry order but not content', () => {
    expect(requestHash(base)).toBe(requestHash({ ...base, entries: [...base.entries].reverse() }));
    expect(requestHash(base)).not.toBe(
      requestHash({ ...base, entries: [
        { accountId: a, direction: 'debit', amount: 101n },
        { accountId: b, direction: 'credit', amount: 101n },
      ] }),
    );
  });
});
