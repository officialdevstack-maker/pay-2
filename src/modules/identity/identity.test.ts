import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAuthorizationRequest: vi.fn(),
  exchangeCode: vi.fn(),
  revoke: vi.fn(),
  endSessionUrl: vi.fn(),
  cookieSessionId: null as string | null,
}));

vi.mock('./client', () => ({
  authClient: () => ({
    createAuthorizationRequest: mocks.createAuthorizationRequest,
    exchangeCode: mocks.exchangeCode,
    revoke: mocks.revoke,
    endSessionUrl: mocks.endSessionUrl,
  }),
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: () => (mocks.cookieSessionId ? { value: mocks.cookieSessionId } : undefined),
  }),
}));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

import { db } from '@/server/db/client';
import { authSessions, oidcAuthRequests, payUsers } from '@/server/db/schema';
import { encrypt } from './seal';
import { beginSignIn, finishSignIn, requireRecentAuth, signOut, type CurrentUser } from './index';

const nowSeconds = () => Math.floor(Date.now() / 1000);
const hasTestDatabase =
  process.env.LEDGER_TEST_DATABASE_URL && process.env.LEDGER_TEST_DATABASE_URL === process.env.DATABASE_URL;
const integration = hasTestDatabase ? describe : describe.skip;

function userWithAuthAge(seconds: number): CurrentUser {
  return {
    id: 'u1',
    sessionId: 's1',
    sub: 'sub1',
    emailVerified: true,
    authTime: new Date(Date.now() - seconds * 1000),
  };
}

describe('requireRecentAuth', () => {
  it('allows a recent login', () => {
    expect(() => requireRecentAuth(userWithAuthAge(30))).not.toThrow();
  });

  it('requires step-up and includes the return path for an old login', () => {
    try {
      requireRecentAuth(userWithAuthAge(3600), { returnTo: '/settings' });
      throw new Error('Expected step-up authentication to be required.');
    } catch (error) {
      expect(error).toMatchObject({ code: 'STEP_UP_REQUIRED', status: 403 });
      expect((error as { details?: { loginUrl?: string } }).details?.loginUrl).toContain(
        'returnTo=%2Fsettings',
      );
    }
  });
});

integration('sign-in flow', () => {
  afterAll(async () => {
    await db.$client.end();
  });

  beforeEach(() => {
    mocks.createAuthorizationRequest.mockReset();
    mocks.exchangeCode.mockReset();
    mocks.revoke.mockReset();
    mocks.endSessionUrl.mockReset();
    mocks.cookieSessionId = null;
  });

  async function begin(stepUp = false) {
    const state = randomUUID();
    mocks.createAuthorizationRequest.mockResolvedValue({
      url: `https://accounts.test/auth?state=${state}`,
      state,
      nonce: randomUUID(),
      codeVerifier: randomUUID(),
      redirectUri: 'http://localhost:3000/auth/callback',
    });
    const url = await beginSignIn('/', { stepUp });
    return { state, url };
  }

  const callback = (state: string) => `http://localhost:3000/auth/callback?code=abc&state=${state}`;
  const tokens = (claims: Record<string, unknown>) => ({
    accessToken: 'test-access-token',
    refreshToken: 'test-refresh-token',
    expiresAt: nowSeconds() + 300,
    claims: { sub: `sub-${randomUUID()}`, email_verified: true, ...claims },
  });

  it('sets prompt and max_age for step-up requests', async () => {
    const { url } = await begin(true);
    const parsed = new URL(url);
    expect(parsed.searchParams.get('prompt')).toBe('login');
    expect(parsed.searchParams.get('max_age')).toBe('300');
  });

  it('accepts a callback once and rejects replayed state', async () => {
    const { state } = await begin();
    mocks.exchangeCode.mockResolvedValue(tokens({ auth_time: nowSeconds() }));

    const result = await finishSignIn(callback(state));
    expect(result.returnTo).toBe('/');
    expect(result.sessionId).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(result)).not.toContain('test-access-token');
    expect(JSON.stringify(result)).not.toContain('test-refresh-token');

    await expect(finishSignIn(callback(state))).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('rejects expired state', async () => {
    const { state } = await begin();
    const stateHash = createHash('sha256').update(state).digest('hex');
    await db
      .update(oidcAuthRequests)
      .set({ expiresAt: new Date(Date.now() - 1_000) })
      .where(eq(oidcAuthRequests.stateHash, stateHash));

    await expect(finishSignIn(callback(state))).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('rejects callbacks with missing or unknown state', async () => {
    await expect(finishSignIn('http://localhost:3000/auth/callback?code=abc')).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    await expect(finishSignIn(callback(randomUUID()))).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });

  it('rejects step-up when auth_time is missing or invalid', async () => {
    const missing = await begin(true);
    mocks.exchangeCode.mockResolvedValue(tokens({}));
    await expect(finishSignIn(callback(missing.state))).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });

    const invalid = await begin(true);
    mocks.exchangeCode.mockResolvedValue(tokens({ auth_time: Number.NaN }));
    await expect(finishSignIn(callback(invalid.state))).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('rejects stale step-up and accepts a fresh auth_time', async () => {
    const stale = await begin(true);
    mocks.exchangeCode.mockResolvedValue(tokens({ auth_time: nowSeconds() - 3600 }));
    await expect(finishSignIn(callback(stale.state))).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });

    const fresh = await begin(true);
    mocks.exchangeCode.mockResolvedValue(tokens({ auth_time: nowSeconds() - 10 }));
    await expect(finishSignIn(callback(fresh.state))).resolves.toMatchObject({ returnTo: '/' });
  });

  it('deletes the session and revokes its refresh token on logout', async () => {
    const [user] = await db
      .insert(payUsers)
      .values({ accountsSub: `logout-test-${randomUUID()}` })
      .returning({ id: payUsers.id });
    if (!user) throw new Error('Test user could not be created.');

    const sessionId = randomBytes(32).toString('hex');
    await db.insert(authSessions).values({
      id: sessionId,
      userId: user.id,
      user: { sub: 'logout-sub' },
      encryptedTokens: encrypt({
        accessToken: 'access',
        refreshToken: 'refresh',
        idToken: 'id-token',
        expiresAt: nowSeconds() + 300,
      }),
      expiresAt: new Date(Date.now() + 60_000),
    });
    mocks.cookieSessionId = sessionId;
    mocks.endSessionUrl.mockResolvedValue('https://accounts.test/logout');

    await expect(signOut()).resolves.toBe('https://accounts.test/logout');
    expect(mocks.revoke).toHaveBeenCalledWith('refresh');
    const rows = await db.select({ id: authSessions.id }).from(authSessions).where(eq(authSessions.id, sessionId));
    expect(rows).toHaveLength(0);
  });
});
