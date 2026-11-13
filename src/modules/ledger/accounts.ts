import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { ledgerAccounts } from '@/server/db/schema';
import { AppError } from '@/lib/errors';
import type { Currency, Direction, Executor } from './types';

const SYSTEM_ACCOUNTS = {
  provider_clearing: 'debit', // asset: money we hold at the provider
  fees: 'credit', // income
  suspense: 'debit', // unmatched or in-flight money
  settlement: 'debit',
} as const satisfies Record<string, Direction>;

export type SystemAccountCode = keyof typeof SYSTEM_ACCOUNTS;

export async function openAccount(
  input: { kind: 'wallet' | 'system'; normalSide?: Direction; code?: string; allowNegative?: boolean; currency?: Currency },
  executor: Executor = db,
): Promise<string> {
  const [row] = await executor
    .insert(ledgerAccounts)
    .values({
      kind: input.kind,
      code: input.code ?? null,
      currency: input.currency ?? 'NGN',
      normalSide: input.normalSide ?? 'credit',
      allowNegative: input.allowNegative ?? input.kind === 'system',
    })
    .returning({ id: ledgerAccounts.id });
  if (!row) throw new AppError('INTERNAL', 'Could not open account.');
  return row.id;
}

const systemIds = new Map<string, string>();

export async function systemAccountId(code: SystemAccountCode, executor: Executor = db): Promise<string> {
  const cached = systemIds.get(code);
  if (cached) return cached;

  await executor
    .insert(ledgerAccounts)
    .values({ kind: 'system', code, normalSide: SYSTEM_ACCOUNTS[code], allowNegative: true })
    .onConflictDoNothing();
  const [row] = await executor
    .select({ id: ledgerAccounts.id })
    .from(ledgerAccounts)
    .where(eq(ledgerAccounts.code, code))
    .limit(1);
  if (!row) throw new AppError('INTERNAL', 'System account missing.');
  systemIds.set(code, row.id);
  return row.id;
}

export async function getBalance(accountId: string, executor: Executor = db): Promise<bigint> {
  const [row] = await executor
    .select({ balance: ledgerAccounts.balance })
    .from(ledgerAccounts)
    .where(eq(ledgerAccounts.id, accountId))
    .limit(1);
  if (!row) throw new AppError('ACCOUNT_NOT_FOUND', 'Account not found.', 404);
  return row.balance;
}
