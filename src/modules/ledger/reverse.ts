import 'server-only';
import { asc, eq } from 'drizzle-orm';
import { db, type Tx } from '@/server/db/client';
import { ledgerEntries, transactions } from '@/server/db/schema';
import { isUniqueViolation } from '@/lib/db-errors';
import { AppError } from '@/lib/errors';
import { post } from './post';
import type { Currency, PostedTransaction } from './types';

export interface ReverseInput {
  transactionId: string;
  idempotency: { scope: string; key: string };
  reason?: string;
}

/** Posts mirrored entries linked to the original. One reversal per transaction, enforced by a unique index. */
export function reverse(input: ReverseInput, tx?: Tx): Promise<PostedTransaction> {
  return tx ? run(tx, input) : db.transaction((inner) => run(inner, input));
}

async function run(tx: Tx, input: ReverseInput): Promise<PostedTransaction> {
  const [original] = await tx.select().from(transactions).where(eq(transactions.id, input.transactionId)).limit(1);
  if (!original) throw new AppError('NOT_FOUND', 'Transaction not found.', 404);
  if (original.reversesTransactionId) {
    throw new AppError('LEDGER_INVALID', 'A reversal cannot itself be reversed.', 422);
  }

  const entries = await tx
    .select()
    .from(ledgerEntries)
    .where(eq(ledgerEntries.transactionId, original.id))
    .orderBy(asc(ledgerEntries.id));

  try {
    return await post(
      {
        type: 'reversal',
        currency: original.currency as Currency,
        idempotency: input.idempotency,
        reversesTransactionId: original.id,
        metadata: { original: original.reference, reason: input.reason ?? null },
        entries: entries.map((e) => ({
          accountId: e.accountId,
          direction: e.direction === 'debit' ? 'credit' : 'debit',
          amount: e.amount,
        })),
      },
      tx,
    );
  } catch (error) {
    if (isUniqueViolation(error, 'transactions_reverses_uq')) {
      throw new AppError('ALREADY_REVERSED', 'This transaction was already reversed.', 409);
    }
    throw error;
  }
}
