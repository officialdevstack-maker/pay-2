import 'server-only';
import { and, asc, eq, gte, inArray, sql } from 'drizzle-orm';
import { WALLET_LIMITS } from '@/config/limits';
import { AppError } from '@/lib/errors';
import type { Tx } from '@/server/db/client';
import { ledgerAccounts, ledgerEntries, wallets } from '@/server/db/schema';
import type { Product } from './types';

export async function assertTransferAllowed(
  tx: Tx,
  input: { userId: string; recipientUserId: string; product: Product; amount: bigint },
): Promise<void> {
  if (input.amount <= 0n) throw new AppError('BAD_REQUEST', 'Transfer amount must be positive.', 422);
  if (input.userId === input.recipientUserId) {
    throw new AppError('SELF_TRANSFER', 'You cannot send money to yourself.', 422);
  }

  const userIds = [input.userId, input.recipientUserId].sort();
  const walletRows = await tx
    .select()
    .from(wallets)
    .where(and(inArray(wallets.userId, userIds), eq(wallets.product, input.product)))
    .orderBy(asc(wallets.userId))
    .for('update');
  const walletByUser = new Map(walletRows.map((wallet) => [wallet.userId, wallet]));
  const senderWallet = walletByUser.get(input.userId);
  const recipientWallet = walletByUser.get(input.recipientUserId);
  if (!senderWallet || !recipientWallet) {
    throw new AppError('WALLET_UNAVAILABLE', 'A wallet is unavailable right now.', 403);
  }
  if (senderWallet.status !== 'active') {
    throw new AppError('WALLET_UNAVAILABLE', 'Your wallet is unavailable right now.', 403);
  }
  if (recipientWallet.status !== 'active') {
    throw new AppError('RECIPIENT_UNAVAILABLE', 'This person cannot receive money right now.', 422);
  }

  const accountIds = [senderWallet.ledgerAccountId, recipientWallet.ledgerAccountId].sort();
  const accounts = await tx
    .select()
    .from(ledgerAccounts)
    .where(inArray(ledgerAccounts.id, accountIds))
    .orderBy(asc(ledgerAccounts.id))
    .for('update');
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const senderAccount = accountById.get(senderWallet.ledgerAccountId);
  const recipientAccount = accountById.get(recipientWallet.ledgerAccountId);
  if (!senderAccount || !recipientAccount) {
    throw new AppError('WALLET_UNAVAILABLE', 'A wallet is unavailable right now.', 403);
  }

  const limits = WALLET_LIMITS[input.product];
  if (input.amount > limits.perTransferKobo) {
    throw new AppError('TRANSFER_LIMIT_EXCEEDED', 'This transfer is above your per-transfer limit.', 422);
  }
  if (recipientAccount.balance + input.amount > limits.maxBalanceKobo) {
    throw new AppError('WALLET_BALANCE_LIMIT', 'The recipient wallet cannot receive this amount.', 422);
  }

  const now = new Date();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const [daily] = await tx
    .select({ amount: sql<string>`coalesce(sum(${ledgerEntries.amount}), 0)::text` })
    .from(ledgerEntries)
    .where(
      and(
        eq(ledgerEntries.accountId, senderWallet.ledgerAccountId),
        eq(ledgerEntries.direction, 'debit'),
        gte(ledgerEntries.createdAt, dayStart),
      ),
    );
  const spentToday = BigInt(daily?.amount ?? '0');
  if (spentToday + input.amount > limits.dailyDebitKobo) {
    throw new AppError('DAILY_LIMIT_EXCEEDED', 'This transfer would exceed your daily limit.', 422);
  }
}
