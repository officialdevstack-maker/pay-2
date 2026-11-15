import { randomBytes, randomUUID } from 'node:crypto';
import { sql, type SQL } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { db } from './db-client';

const hasTestDatabase = Boolean(
  process.env.DATABASE_URL &&
    process.env.LEDGER_TEST_DATABASE_URL &&
    process.env.LEDGER_TEST_DATABASE_URL === process.env.DATABASE_URL,
);

const ref = () => `SPY_${randomBytes(8).toString('hex').toUpperCase()}`;
const hash = () => randomBytes(32).toString('hex');
const rows = async <T>(query: SQL) => (await db.execute(query)).rows as T[];

async function fixture() {
  const [user] = await rows<{ id: string }>(
    sql`insert into pay_users (accounts_sub) values (${randomUUID()}) returning id`,
  );
  const [account] = await rows<{ id: string }>(
    sql`insert into ledger_accounts (kind, normal_side) values ('wallet', 'credit') returning id`,
  );
  const [merchant] = await rows<{ id: string }>(
    sql`insert into merchants (name, client_id, ledger_account_id, return_url)
        values ('Spurs Store', ${randomUUID()}, ${account!.id}, 'https://store.example') returning id`,
  );
  const [session] = await rows<{ id: string }>(
    sql`insert into checkout_sessions
          (reference, merchant_id, merchant_reference, amount, idempotency_key, request_hash, expires_at)
        values (${ref()}, ${merchant!.id}, ${randomUUID()}, 1250050, ${randomUUID()}, ${hash()},
                now() + interval '30 minutes') returning id`,
  );
  return { userId: user!.id, sessionId: session!.id };
}

const insertAttempt = async (sessionId: string, userId: string, key = randomUUID()) => {
  const [attempt] = await rows<{ id: string }>(
    sql`insert into checkout_attempts (session_id, user_id, method, idempotency_key, request_hash)
        values (${sessionId}, ${userId}, 'bank_transfer', ${key}, ${hash()}) returning id`,
  );
  return attempt!.id;
};

describe.skipIf(!hasTestDatabase)('checkout attempt schema', () => {
  afterAll(async () => {
    await db.$client.end();
  });

  it('rejects attempts when the session has no bound customer', async () => {
    const { userId, sessionId } = await fixture();
    await expect(insertAttempt(sessionId, userId)).rejects.toThrow();
  });

  it('rejects an attempt from a different customer than the session owner', async () => {
    const owner = await fixture();
    const other = await fixture();
    await db.execute(sql`update checkout_sessions set user_id = ${owner.userId} where id = ${owner.sessionId}`);
    await expect(insertAttempt(owner.sessionId, other.userId)).rejects.toThrow();
  });

  it('allows only one active attempt per session, including unknown outcomes', async () => {
    const { userId, sessionId } = await fixture();
    await db.execute(sql`update checkout_sessions set user_id = ${userId} where id = ${sessionId}`);
    const attemptId = await insertAttempt(sessionId, userId);
    await expect(insertAttempt(sessionId, userId)).rejects.toThrow();
    await db.execute(sql`update checkout_attempts set status = 'unknown' where id = ${attemptId}`);
    await expect(insertAttempt(sessionId, userId)).rejects.toThrow();
  });

  it('allows a new attempt after failure and rejects a second successful attempt', async () => {
    const { userId, sessionId } = await fixture();
    await db.execute(sql`update checkout_sessions set user_id = ${userId} where id = ${sessionId}`);
    const failedAttemptId = await insertAttempt(sessionId, userId);
    await db.execute(sql`update checkout_attempts set status = 'unknown' where id = ${failedAttemptId}`);
    await db.execute(
      sql`update checkout_attempts set status = 'failed', resolved_at = now() where id = ${failedAttemptId}`,
    );
    const successfulAttemptId = await insertAttempt(sessionId, userId);
    const [transaction] = await rows<{ id: string }>(
      sql`insert into transactions (reference, type, currency) values (${ref()}, 'payment', 'NGN') returning id`,
    );
    await db.execute(
      sql`update checkout_sessions set status = 'paid', transaction_id = ${transaction!.id}
          where id = ${sessionId}`,
    );
    await db.execute(sql`update checkout_attempts set status = 'unknown' where id = ${successfulAttemptId}`);
    await db.execute(
      sql`update checkout_attempts set status = 'succeeded', resolved_at = now() where id = ${successfulAttemptId}`,
    );
    const secondSuccessId = await insertAttempt(sessionId, userId);
    await db.execute(sql`update checkout_attempts set status = 'unknown' where id = ${secondSuccessId}`);
    await expect(
      db.execute(
        sql`update checkout_attempts set status = 'succeeded', resolved_at = now() where id = ${secondSuccessId}`,
      ),
    ).rejects.toThrow();
  });

  it('keeps customer binding and resolved attempts immutable', async () => {
    const { userId, sessionId } = await fixture();
    const other = await fixture();
    await db.execute(sql`update checkout_sessions set user_id = ${userId} where id = ${sessionId}`);
    await expect(
      db.execute(sql`update checkout_sessions set user_id = ${other.userId} where id = ${sessionId}`),
    ).rejects.toThrow();
    const attemptId = await insertAttempt(sessionId, userId);
    await db.execute(sql`update checkout_attempts set status = 'unknown' where id = ${attemptId}`);
    await db.execute(sql`update checkout_attempts set status = 'failed', resolved_at = now() where id = ${attemptId}`);
    await expect(
      db.execute(sql`update checkout_attempts set status = 'pending', resolved_at = null where id = ${attemptId}`),
    ).rejects.toThrow();
  });

  it('requires an unknown state before a pending attempt can be resolved', async () => {
    const { userId, sessionId } = await fixture();
    await db.execute(sql`update checkout_sessions set user_id = ${userId} where id = ${sessionId}`);
    const attemptId = await insertAttempt(sessionId, userId);
    await expect(
      db.execute(sql`update checkout_attempts set status = 'failed', resolved_at = now() where id = ${attemptId}`),
    ).rejects.toThrow();
    await db.execute(sql`update checkout_attempts set status = 'unknown' where id = ${attemptId}`);
    await expect(
      db.execute(
        sql`update checkout_attempts set status = 'succeeded', resolved_at = now() where id = ${attemptId}`,
      ),
    ).rejects.toThrow();
    await db.execute(
      sql`update checkout_attempts set status = 'failed', resolved_at = now() where id = ${attemptId}`,
    );
  });
});
