export type EntryDirection = 'debit' | 'credit';
export interface PostEntry {
  accountId: string;
  direction: EntryDirection;
  amount: bigint;
}
export interface Idempotency {
  scope: string;
  key: string;
}

export function validatePostEntries(entries: PostEntry[]): PostEntry[] {
  return entries;
}

export function validateIdempotency(idempotency: Idempotency): void {
  if (!idempotency.scope || !idempotency.key) {
    throw new Error('Invalid idempotency');
  }
}
