import { createHash } from 'node:crypto';
import { AppError } from '@/lib/errors';
import type { EntryInput, PostInput } from './types';

export function validateEntries(entries: readonly EntryInput[]): void {
  if (entries.length < 2) {
    throw new AppError('LEDGER_INVALID', 'A transaction needs at least two entries.', 422);
  }
  let debits = 0n;
  let credits = 0n;
  for (const entry of entries) {
    if (typeof entry.amount !== 'bigint' || entry.amount <= 0n) {
      throw new AppError('LEDGER_INVALID', 'Entry amounts must be positive integers (kobo).', 422);
    }
    if (entry.direction === 'debit') debits += entry.amount;
    else if (entry.direction === 'credit') credits += entry.amount;
    else throw new AppError('LEDGER_INVALID', 'Entry direction must be debit or credit.', 422);
  }
  if (debits !== credits) {
    throw new AppError('LEDGER_UNBALANCED', 'Debits must equal credits.', 422);
  }
}

/** Same logical request, same hash. Used to detect a key being reused for a different request. */
export function requestHash(input: Pick<PostInput, 'type' | 'entries' | 'reversesTransactionId'>): string {
  const entries = input.entries
    .map((e) => `${e.accountId}:${e.direction}:${e.amount.toString()}`)
    .sort()
    .join('|');
  return createHash('sha256')
    .update(`${input.type}#${input.reversesTransactionId ?? ''}#${entries}`)
    .digest('hex');
}
