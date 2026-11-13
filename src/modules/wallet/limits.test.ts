import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { WALLET_LIMITS } from '@/config/limits';
import { post, systemAccountId } from '@/modules/ledger';
import { db } from '@/server/db/client';
import { payUsers } from '@/server/db/schema';
import { ensureWallet } from './index';
import { assertTransferAllowed } from './limits';

const hasTestDatabase =
  process.env.LEDGER_TEST_DATABASE_URL && process.env.LEDGER_TEST_DATABASE_URL === process.env.DATABASE_URL;
const integration = hasTestDatabase ? describe : describe.skip;

integration('wallet transfer limits', () => {
  afterAll(async () => {
    await db.$client.end();
  });

  async function wallet() {
    const [user] = await db
      .insert(payUsers)
      .values({ accountsSub: `limit-test-${randomUUID()}` })
      .returning({ id: payUsers.id });
    if (!user) throw new Error('Test user could not be created.');
    const ensured = await ensureWallet(user.id, 'pay');
    return { userId: user.id, ledgerAccountId: ensured.ledgerAccountId };
  }

  it('rejects amounts above the configured per-transfer limit', async () => {
    const sender = await wallet();
    const recipient = await wallet();

    await expect(
      db.transaction((tx) =>
        assertTransferAllowed(tx, {
          userId: sender.userId,
          recipientUserId: recipient.userId,
          product: 'pay',
          amount: WALLET_LIMITS.pay.perTransferKobo + 1n,
        }),
      ),
    ).rejects.toMatchObject({ code: 'TRANSFER_LIMIT_EXCEEDED' });
  });

  it('serializes daily-limit checks for concurrent debits', async () => {
    const sender = await wallet();
    const recipientA = await wallet();
    const recipientB = await wallet();
    const amount = WALLET_LIMITS.pay.dailyDebitKobo / 2n + 1n;
    await post({
      type: 'funding',
      idempotency: { scope: sender.userId, key: randomUUID() },
      entries: [
        { accountId: await systemAccountId('suspense'), direction: 'debit', amount: amount * 2n },
        { accountId: sender.ledgerAccountId, direction: 'credit', amount: amount * 2n },
      ],
    });

    const send = (recipient: typeof recipientA) =>
      db.transaction(async (tx) => {
        await assertTransferAllowed(tx, {
          userId: sender.userId,
          recipientUserId: recipient.userId,
          product: 'pay',
          amount,
        });
        await post(
          {
            type: 'transfer',
            idempotency: { scope: sender.userId, key: randomUUID() },
            entries: [
              { accountId: sender.ledgerAccountId, direction: 'debit', amount },
              { accountId: recipient.ledgerAccountId, direction: 'credit', amount },
            ],
          },
          tx,
        );
      });

    const results = await Promise.allSettled([send(recipientA), send(recipientB)]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
  });
});
