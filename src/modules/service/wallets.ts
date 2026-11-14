import 'server-only';
import { and, desc, eq, inArray, lt } from 'drizzle-orm';
import { getBalance } from '@/modules/ledger';
import { cleanNote, transferBetweenUsers } from '@/modules/transfers';
import { ensureWallet, setPin, verifyPin } from '@/modules/wallet';
import { db } from '@/server/db/client';
import { ledgerEntries, payUsers, transactions } from '@/server/db/schema';
import { assertUserActive } from './deps';
import type { ServiceCaller } from './types';
import { findUser, provisionUser } from './users';

async function walletView(caller: ServiceCaller, userId: string) {
  const wallet = await ensureWallet(userId, caller.product);
  const balance = await getBalance(wallet.ledgerAccountId);
  return { status: wallet.status, currency: 'NGN' as const, balanceKobo: balance.toString() };
}

export async function openWallet(caller: ServiceCaller, sub: string) {
  await assertUserActive(sub);
  const user = await provisionUser(sub);
  return walletView(caller, user.id);
}

export async function getWalletBalance(caller: ServiceCaller, sub: string) {
  return walletView(caller, (await findUser(sub)).id);
}

export async function setWalletPin(caller: ServiceCaller, sub: string, pin: string): Promise<void> {
  await assertUserActive(sub);
  await setPin((await findUser(sub)).id, caller.product, pin);
}

export async function verifyWalletPin(caller: ServiceCaller, sub: string, pin: string): Promise<void> {
  await verifyPin((await findUser(sub)).id, caller.product, pin);
}

export interface ServiceTransfer {
  fromSub: string;
  toSub: string;
  amount: bigint;
  note: string | null | undefined;
  pin: string;
  idempotencyKey: string;
}

export async function transferFunds(caller: ServiceCaller, input: ServiceTransfer) {
  const [sender, recipient] = await Promise.all([findUser(input.fromSub), findUser(input.toSub)]);
  await assertUserActive(input.fromSub);

  const note = cleanNote(input.note);
  const outcome = await transferBetweenUsers({
    product: caller.product,
    sender: { id: sender.id, name: null },
    recipient: { id: recipient.id },
    amount: input.amount,
    note,
    pin: input.pin,
    idempotency: { scope: `svc:${caller.clientId}:${sender.id}`, key: `transfer:${input.idempotencyKey}` },
    sideEffects: false,
  });

  return {
    transfer: {
      reference: outcome.reference,
      amountKobo: input.amount.toString(),
      currency: 'NGN' as const,
      note,
      createdAt: outcome.createdAt.toISOString(),
    },
    replayed: outcome.replayed,
  };
}

export async function listActivity(
  caller: ServiceCaller,
  sub: string,
  page: { cursor: bigint | null; limit: number },
) {
  const user = await findUser(sub);
  const wallet = await ensureWallet(user.id, caller.product);

  const rows = await db
    .select({
      entryId: ledgerEntries.id,
      reference: transactions.reference,
      type: transactions.type,
      direction: ledgerEntries.direction,
      amount: ledgerEntries.amount,
      balanceAfter: ledgerEntries.balanceAfter,
      createdAt: ledgerEntries.createdAt,
      metadata: transactions.metadata,
    })
    .from(ledgerEntries)
    .innerJoin(transactions, eq(transactions.id, ledgerEntries.transactionId))
    .where(
      and(
        eq(ledgerEntries.accountId, wallet.ledgerAccountId),
        page.cursor === null ? undefined : lt(ledgerEntries.id, page.cursor),
      ),
    )
    .orderBy(desc(ledgerEntries.id))
    .limit(page.limit + 1);

  const items = rows.slice(0, page.limit);
  const counterpartyOf = (row: (typeof rows)[number]): string | null => {
    if (row.type !== 'transfer') return null;
    const value = row.metadata[row.direction === 'credit' ? 'sender' : 'recipient'];
    return typeof value === 'string' ? value : null;
  };

  const ids = [
    ...new Set(items.map((row) => counterpartyOf(row)).filter((id): id is string => typeof id === 'string')),
  ];
  const subs = ids.length
    ? await db
        .select({ id: payUsers.id, sub: payUsers.accountsSub })
        .from(payUsers)
        .where(inArray(payUsers.id, ids))
    : [];
  const subById = new Map(subs.map((row) => [row.id, row.sub]));

  return {
    items: items.map((row) => {
      const counterparty = counterpartyOf(row);
      const note = row.metadata['note'];
      return {
        reference: row.reference,
        type: row.type,
        kind: row.direction === 'credit' ? ('in' as const) : ('out' as const),
        amountKobo: row.amount.toString(),
        balanceAfterKobo: row.balanceAfter.toString(),
        note: typeof note === 'string' ? note : null,
        counterpartySub: counterparty ? (subById.get(counterparty) ?? null) : null,
        createdAt: row.createdAt.toISOString(),
      };
    }),
    nextCursor: rows.length > page.limit ? (items.at(-1)?.entryId.toString() ?? null) : null,
  };
}
