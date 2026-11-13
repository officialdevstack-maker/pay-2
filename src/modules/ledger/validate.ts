import { createHash } from 'node:crypto';
import { AppError } from '@/lib/errors';
import type { EntryInput, PostInput } from './types';

export function validateEntries(entries: readonly EntryInput[]): void {
  if (!Array.isArray(entries) || entries.length < 2) {
    throw new AppError('LEDGER_INVALID', 'A transaction needs at least two entries.', 422);
  }
  let debits = 0n;
  let credits = 0n;
  for (const entry of entries) {
    if (
      !entry ||
      typeof entry !== 'object' ||
      typeof entry.accountId !== 'string' ||
      entry.accountId.trim().length === 0
    ) {
      throw new AppError('LEDGER_INVALID', 'Each entry needs a ledger account.', 422);
    }
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

export function validatePostInput(input: PostInput): void {
  if (!input || typeof input !== 'object') {
    throw new AppError('LEDGER_INVALID', 'Transaction details are required.', 422);
  }
  if (
    typeof input.type !== 'string' ||
    input.type.trim().length === 0 ||
    input.type.length > 64 ||
    /[\u0000-\u001f]/.test(input.type)
  ) {
    throw new AppError('LEDGER_INVALID', 'Transaction type is invalid.', 422);
  }
  if (!input.idempotency || typeof input.idempotency !== 'object') {
    throw new AppError('LEDGER_INVALID', 'An idempotency scope and key are required.', 422);
  }
  const { scope, key } = input.idempotency;
  if (
    typeof scope !== 'string' ||
    scope.trim().length === 0 ||
    scope.length > 128 ||
    /[\u0000-\u001f]/.test(scope) ||
    typeof key !== 'string' ||
    key.trim().length === 0 ||
    key.length > 200 ||
    /[\u0000-\u001f]/.test(key)
  ) {
    throw new AppError('LEDGER_INVALID', 'The idempotency scope or key is invalid.', 422);
  }
  if (input.currency !== undefined && input.currency !== 'NGN') {
    throw new AppError('CURRENCY_MISMATCH', 'The transaction currency is not supported.', 422);
  }
  if (
    input.metadata !== undefined &&
    (!input.metadata ||
      typeof input.metadata !== 'object' ||
      Array.isArray(input.metadata) ||
      Object.values(input.metadata).some(
        (value) =>
          value !== null &&
          typeof value !== 'string' &&
          typeof value !== 'boolean' &&
          (typeof value !== 'number' || !Number.isFinite(value)),
      ))
  ) {
    throw new AppError('LEDGER_INVALID', 'Transaction metadata is invalid.', 422);
  }
}

/** Same logical request, same hash. Used to detect a key being reused for a different request. */
export function requestHash(
  input: Pick<
    PostInput,
    'type' | 'currency' | 'entries' | 'reversesTransactionId' | 'metadata'
  >,
): string {
  const entries = input.entries
    .map((entry) => ({
      accountId: entry.accountId,
      direction: entry.direction,
      amount: entry.amount.toString(),
    }))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  const metadata = Object.fromEntries(
    Object.entries(input.metadata ?? {}).sort(([left], [right]) => left.localeCompare(right)),
  );
  return createHash('sha256')
    .update(
      JSON.stringify({
        type: input.type,
        currency: input.currency ?? 'NGN',
        reversesTransactionId: input.reversesTransactionId ?? null,
        entries,
        metadata,
      }),
    )
    .digest('hex');
}
