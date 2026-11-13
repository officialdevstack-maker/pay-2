import 'server-only';
import { createHash, createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { and, eq, gt, lt } from 'drizzle-orm';
import { SpursAuth, SpursAuthError } from '@officialdevstack-maker/auth';
import type { IdTokenClaims, TokenSet } from '@officialdevstack-maker/auth';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { env } from '@/env';
import { db } from '@/server/db/client';
import { authSessions, oidcAuthRequests, payUsers } from '@/server/db/schema';
import { ensureWallet } from '@/modules/wallet';
import { AppError } from '@/lib/errors';

export const SESSION_COOKIE = 'spurs_pay_session';
const AUTH_REQUEST_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const TOKEN_REFRESH_SKEW_SECONDS = 60;

type User = {
  sub: string;
  name?: string;
  username?: string;
  email?: string;
  email_verified?: boolean;
};

type AuthContext = {
  state: string;
  nonce: string;
  codeVerifier: string;
  redirectUri: string;
  returnTo: string;
};

function authClient() {
  return new SpursAuth({
    issuer: env.ACCOUNTS_ISSUER,
    clientId: env.ACCOUNTS_CLIENT_ID,
    clientSecret: env.ACCOUNTS_CLIENT_SECRET,
    redirectUri: new URL('/auth/callback', env.APP_URL).toString(),
    postLogoutRedirectUri: new URL('/signed-out', env.APP_URL).toString(),
    scope: 'openid profile email offline_access',
    storage: 'memory',
  });
}

function encryptionKey(): Buffer {
  return scryptSync(env.SESSION_SECRET, 'spurs-pay-auth-v1', 32);
}

function encrypt(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString('base64url')).join('.');
}

function decrypt<T>(value: string): T {
  const [encodedIv, encodedTag, encodedCiphertext, extra] = value.split('.');
  if (!encodedIv || !encodedTag || !encodedCiphertext || extra !== undefined) {
    throw new AppError('INTERNAL', 'Stored sign-in data is invalid.');
  }
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(encodedIv, 'base64url'));
  decipher.setAuthTag(Buffer.from(encodedTag, 'base64url'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(encodedCiphertext, 'base64url')),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString('utf8')) as T;
}

function stateHash(state: string): string {
  return createHash('sha256').update(state).digest('hex');
}

function safeReturnTo(value: string | null): string {
  if (!value) return '/';
  const destination = new URL(value, env.APP_URL);
  const appOrigin = new URL(env.APP_URL).origin;
  if (destination.origin !== appOrigin) return '/';
  return `${destination.pathname}${destination.search}${destination.hash}`;
}

function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  };
}

function asUser(claims: IdTokenClaims): User {
  if (!claims.sub) throw new AppError('UNAUTHENTICATED', 'Sign-in did not return a valid user.', 401);
  return {
    sub: claims.sub,
    ...(typeof claims.name === 'string' && { name: claims.name }),
    ...(typeof claims.preferred_username === 'string' && { username: claims.preferred_username }),
    ...(typeof claims.email === 'string' && { email: claims.email }),
    ...(typeof claims.email_verified === 'boolean' && { email_verified: claims.email_verified }),
  };
}

export async function beginSignIn(returnTo: string | null): Promise<string> {
  const client = authClient();
  const request = await client.createAuthorizationRequest();
  const now = new Date();
  await db.delete(oidcAuthRequests).where(lt(oidcAuthRequests.expiresAt, now));
  await db.insert(oidcAuthRequests).values({
    stateHash: stateHash(request.state),
    encryptedContext: encrypt({
      state: request.state,
      nonce: request.nonce,
      codeVerifier: request.codeVerifier,
      redirectUri: request.redirectUri,
      returnTo: safeReturnTo(returnTo),
    } satisfies AuthContext),
    expiresAt: new Date(now.getTime() + AUTH_REQUEST_TTL_MS),
  });
  return request.url;
}

export async function finishSignIn(callbackUrl: string): Promise<{ sessionId: string; returnTo: string }> {
  const callback = new URL(callbackUrl);
  const state = callback.searchParams.get('state');
  if (!state) throw new AppError('UNAUTHENTICATED', 'The sign-in response is missing state.', 401);

  const [pending] = await db
    .delete(oidcAuthRequests)
    .where(and(eq(oidcAuthRequests.stateHash, stateHash(state)), gt(oidcAuthRequests.expiresAt, new Date())))
    .returning({ encryptedContext: oidcAuthRequests.encryptedContext });
  if (!pending) throw new AppError('UNAUTHENTICATED', 'This sign-in request expired. Please try again.', 401);

  const context = decrypt<AuthContext>(pending.encryptedContext);
  const tokens = await authClient().exchangeCode(callback, context);
  if (!tokens.claims) throw new AppError('UNAUTHENTICATED', 'Sign-in did not return a verified identity.', 401);
  const user = asUser(tokens.claims);

  const [created] = await db
    .insert(payUsers)
    .values({ accountsSub: user.sub })
    .onConflictDoNothing({ target: payUsers.accountsSub })
    .returning({ id: payUsers.id });
  const [payUser] = created
    ? [created]
    : await db.select({ id: payUsers.id }).from(payUsers).where(eq(payUsers.accountsSub, user.sub)).limit(1);
  if (!payUser) throw new AppError('INTERNAL', 'Could not create the Pay account.');
  await ensureWallet(payUser.id, 'pay');

  const sessionId = randomBytes(32).toString('hex');
  await db.insert(authSessions).values({
    id: sessionId,
    userId: payUser.id,
    user,
    encryptedTokens: encrypt(tokens),
    expiresAt: new Date((tokens.refreshToken ? Date.now() / 1000 + SESSION_TTL_SECONDS : tokens.expiresAt) * 1000),
  });
  return { sessionId, returnTo: context.returnTo };
}

async function loadAndRefreshSession(sessionId: string): Promise<User | null> {
  return db.transaction(async (tx) => {
    const [session] = await tx
      .select()
      .from(authSessions)
      .where(eq(authSessions.id, sessionId))
      .for('update')
      .limit(1);
    if (!session || session.expiresAt <= new Date()) {
      if (session) await tx.delete(authSessions).where(eq(authSessions.id, sessionId));
      return null;
    }

    const tokens = decrypt<TokenSet>(session.encryptedTokens);
    if (tokens.expiresAt > Date.now() / 1000 + TOKEN_REFRESH_SKEW_SECONDS) return session.user;
    if (!tokens.refreshToken) {
      await tx.delete(authSessions).where(eq(authSessions.id, sessionId));
      return null;
    }

    let refreshed: TokenSet;
    try {
      refreshed = await authClient().refresh(tokens.refreshToken);
    } catch (error) {
      if (error instanceof SpursAuthError && error.code === 'invalid_grant') {
        await tx.delete(authSessions).where(eq(authSessions.id, sessionId));
        return null;
      }
      throw error;
    }

    await tx
      .update(authSessions)
      .set({
        encryptedTokens: encrypt(refreshed),
        expiresAt: new Date((refreshed.refreshToken ? Date.now() / 1000 + SESSION_TTL_SECONDS : refreshed.expiresAt) * 1000),
      })
      .where(eq(authSessions.id, sessionId));
    return session.user;
  });
}

export async function getUser(): Promise<User | null> {
  const jar = await cookies();
  const sessionId = jar.get(SESSION_COOKIE)?.value;
  if (!sessionId || !/^[a-f0-9]{64}$/.test(sessionId)) return null;
  return loadAndRefreshSession(sessionId);
}

export async function requireUser(): Promise<User> {
  const user = await getUser();
  if (!user) redirect(new URL('/auth/login', env.APP_URL).toString());
  return user;
}

export async function signOut(sessionId: string | undefined): Promise<string> {
  if (!sessionId || !/^[a-f0-9]{64}$/.test(sessionId)) {
    return new URL('/signed-out', env.APP_URL).toString();
  }

  const [session] = await db.select().from(authSessions).where(eq(authSessions.id, sessionId)).limit(1);
  await db.delete(authSessions).where(eq(authSessions.id, sessionId));
  if (!session) return new URL('/signed-out', env.APP_URL).toString();

  const tokens = decrypt<TokenSet>(session.encryptedTokens);
  const client = authClient();
  if (tokens.refreshToken) await client.revoke(tokens.refreshToken);
  if (tokens.idToken) {
    return client.endSessionUrl({
      idTokenHint: tokens.idToken,
      postLogoutRedirectUri: new URL('/signed-out', env.APP_URL).toString(),
    });
  }
  return new URL('/signed-out', env.APP_URL).toString();
}

export function cookieOptions() {
  return sessionCookieOptions();
}
