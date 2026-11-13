import 'server-only';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db, type Tx } from '@/server/db/client';
import { idempotencyKeys, ledgerAccounts, ledgerEntries, transactions } from '@/server/db/schema';
import { AppError } from '@/lib/errors';
import { newReference } from '@/lib/ids';
import type { PostedEntry, PostedTransaction, PostInput } from './types';
import { requestHash, validateEntries, validatePostInput } from './validate';

/**
 * Posts one balanced transaction atomically. Pass `tx` to join an outer DB transaction.
 * Replays with the same (scope, key) and the same request return the original result.
 */
export async function post(input: PostInput, tx?: Tx): Promise<PostedTransaction> {
  validatePostInput(input);
  validateEntries(input.entries);
  return tx ? postIn(tx, input) : db.transaction((inner) => postIn(inner, input));
}

async function postIn(tx: Tx, input: PostInput): Promise<PostedTransaction> {
  const currency = input.currency ?? 'NGN';
  const hash = requestHash(input);
  const { scope, key } = input.idempotency;

  // 1. Claim the key. A concurrent claimant blocks here until the first one commits or rolls back.
  const claimed = await tx
    .insert(idempotencyKeys)
    .values({ scope, key, requestHash: hash })
    .onConflictDoNothing()
    .returning({ key: idempotencyKeys.key });
  if (claimed.length === 0) return replay(tx, scope, key, hash);

  // 2. Lock every touched account in ascending id order (deadlock-free).
  const ids = [...new Set(input.entries.map((e) => e.accountId))];
  const rows = await tx
    .select()
    .from(ledgerAccounts)
    .where(inArray(ledgerAccounts.id, ids))
    .orderBy(asc(ledgerAccounts.id))
    .for('update');
  if (rows.length !== ids.length) throw new AppError('ACCOUNT_NOT_FOUND', 'Account not found.', 404);
  if (rows.some((r) => r.currency !== currency)) {
    throw new AppError('CURRENCY_MISMATCH', 'All accounts must use the transaction currency.', 422);
  }

  // 3. Apply entries to the locked balances.
  const state = new Map(rows.map((row) => [row.id, { row, balance: row.balance }]));
  const pending: PostedEntry[] = [];
  for (const entry of input.entries) {
    const account = state.get(entry.accountId);
    if (!account) throw new AppError('ACCOUNT_NOT_FOUND', 'Account not found.', 404);
    account.balance += entry.direction === account.row.normalSide ? entry.amount : -entry.amount;
    pending.push({ ...entry, balanceAfter: account.balance });
  }
  for (const { row, balance } of state.values()) {
    if (!row.allowNegative && balance < 0n) {
      throw new AppError('INSUFFICIENT_FUNDS', 'Insufficient balance.', 422);
    }
  }

  // 4. Write the transaction and its entries, then the new balances.
  const [txn] = await tx
    .insert(transactions)
    .values({
      reference: newReference(),
      type: input.type,
      currency,
      metadata: input.metadata ?? {},
      reversesTransactionId: input.reversesTransactionId ?? null,
    })
    .returning();
  if (!txn) throw new AppError('INTERNAL', 'Could not record transaction.');

  await tx.insert(ledgerEntries).values(pending.map((e) => ({ ...e, transactionId: txn.id })));

  for (const { row, balance } of state.values()) {
    if (balance === row.balance) continue;
    await tx
      .update(ledgerAccounts)
      .set({ balance, version: sql`${ledgerAccounts.version} + 1` })
      .where(eq(ledgerAccounts.id, row.id));
  }

  await tx
    .update(idempotencyKeys)
    .set({ transactionId: txn.id })
    .where(and(eq(idempotencyKeys.scope, scope), eq(idempotencyKeys.key, key)));

  return {
    id: txn.id,
    reference: txn.reference,
    type: txn.type,
    currency: txn.currency,
    createdAt: txn.createdAt,
    entries: pending,
    replayed: false,
  };
}

async function replay(tx: Tx, scope: string, key: string, hash: string): Promise<PostedTransaction> {
  const [claim] = await tx
    .select()
    .from(idempotencyKeys)
    .where(and(eq(idempotencyKeys.scope, scope), eq(idempotencyKeys.key, key)))
    .limit(1);
  if (claim?.requestHash !== hash) {
    throw new AppError('IDEMPOTENCY_MISMATCH', 'This request key was already used for a different request.', 409);
  }
  if (!claim.transactionId) {
    throw new AppError('IDEMPOTENCY_IN_PROGRESS', 'This request is still being processed.', 409);
  }

  const [txn] = await tx.select().from(transactions).where(eq(transactions.id, claim.transactionId)).limit(1);
  if (!txn) throw new AppError('INTERNAL', 'Original transaction missing.');
  const entries = await tx
    .select()
    .from(ledgerEntries)
    .where(eq(ledgerEntries.transactionId, txn.id))
    .orderBy(asc(ledgerEntries.id));

  return {
    id: txn.id,
    reference: txn.reference,
    type: txn.type,
    currency: txn.currency,
    createdAt: txn.createdAt,
    entries: entries.map((e) => ({
      accountId: e.accountId,
      direction: e.direction,
      amount: e.amount,
      balanceAfter: e.balanceAfter,
    })),
    replayed: true,
  };
}
