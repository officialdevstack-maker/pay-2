import type { Db, Tx } from '@/server/db/client';

export type Direction = 'debit' | 'credit';
export type Currency = 'NGN';
export type Executor = Db | Tx;

export interface EntryInput {
  accountId: string;
  direction: Direction;
  amount: bigint; // kobo, > 0
}

export interface PostInput {
  type: string; // 'funding' | 'transfer' | 'payout' | 'fee' | 'reversal' | ...
  currency?: Currency;
  /** scope is usually the acting user's id, or 'system' / 'provider' for internal posts. */
  idempotency: { scope: string; key: string };
  entries: readonly EntryInput[];
  metadata?: Record<string, string | number | boolean | null>;
  reversesTransactionId?: string;
}

export interface PostedEntry extends EntryInput {
  balanceAfter: bigint;
}

export interface PostedTransaction {
  id: string;
  reference: string;
  type: string;
  currency: string;
  createdAt: Date;
  entries: PostedEntry[];
  /** true when this call returned the result of an earlier identical request. */
  replayed: boolean;
}
