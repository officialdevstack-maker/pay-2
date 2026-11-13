import { randomBytes, randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/server/db/client';
import { authSessions, payUsers } from '@/server/db/schema';
import { encrypt } from './seal';

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('./client', () => ({ authClient: () => ({ refresh: mocks.refresh }) }));

import { resolveSession } from './session';

const hasTestDatabase =
  process.env.LEDGER_TEST_DATABASE_URL && process.env.LEDGER_TEST_DATABASE_URL === process.env.DATABASE_URL;
const integration = hasTestDatabase ? describe : describe.skip;

const inSeconds = (seconds: number) => Math.floor(Date.now() / 1000) + seconds;

integration('session resolution', () => {
  afterAll(async () => {
    await db.$client.end();
  });

  beforeEach(() => mocks.refresh.mockReset());

  async function createSession(expiresAt: number, sessionExpiresAt = new Date(Date.now() + 3_600_000)) {
    const [user] = await db
      .insert(payUsers)
      .values({ accountsSub: `session-test-${randomUUID()}` })
      .returning({ id: payUsers.id });
    if (!user) throw new Error('Test user could not be created.');
    const id = randomBytes(32).toString('hex');
    await db.insert(authSessions).values({
      id,
      userId: user.id,
      user: { sub: 'sub' },
      encryptedTokens: encrypt({ accessToken: 'old', refreshToken: 'r1', expiresAt }),
      expiresAt: sessionExpiresAt,
    });
    return id;
  }

  it('does not refresh a fresh session', async () => {
    const id = await createSession(inSeconds(600));
    expect(await resolveSession(id)).not.toBeNull();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it('deletes an expired session', async () => {
    const id = await createSession(inSeconds(600), new Date(Date.now() - 1_000));

    expect(await resolveSession(id)).toBeNull();
    const rows = await db.select({ id: authSessions.id }).from(authSessions).where(eq(authSessions.id, id));
    expect(rows).toHaveLength(0);
  });

  it('refreshes only once for concurrent requests', async () => {
    const id = await createSession(inSeconds(-10));
    mocks.refresh.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { accessToken: 'new', refreshToken: 'r2', expiresAt: inSeconds(300) };
    });

    const results = await Promise.all(Array.from({ length: 10 }, () => resolveSession(id)));
    expect(results.every((row) => row !== null)).toBe(true);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(mocks.refresh).toHaveBeenCalledWith('r1');
  });

  it('ends the session when the refresh token is rejected', async () => {
    const id = await createSession(inSeconds(-10));
    mocks.refresh.mockRejectedValue(Object.assign(new Error('rejected'), { code: 'invalid_grant' }));

    expect(await resolveSession(id)).toBeNull();
    const rows = await db.select({ id: authSessions.id }).from(authSessions).where(eq(authSessions.id, id));
    expect(rows).toHaveLength(0);
  });
});
