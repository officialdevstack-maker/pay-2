import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, lt, sql } from 'drizzle-orm';
import type { IdTokenClaims, TokenSet } from '@spurs/auth';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { AUTH } from '@/config/auth';
import { env } from '@/env';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { syncContacts } from '@/modules/profile/contacts';
import { ensureWallet } from '@/modules/wallet';
import { db } from '@/server/db/client';
import { authSessions, oidcAuthRequests, payUsers } from '@/server/db/schema';
import { authClient } from './client';
import { safeReturnTo } from './return-to';
import { decrypt, encrypt } from './seal';
import { resolveSession, SESSION_ID, sessionExpiry, type SessionRow } from './session';
import { assertNotSuspended } from './status';

export { assertNotSuspended } from './status';

export const SESSION_COOKIE = 'spurs_pay_session';

type StoredUser = SessionRow['user'];

type AuthContext = {
  state: string;
  nonce: string;
  codeVerifier: string;
  redirectUri: string;
  returnTo: string;
  stepUp: boolean;
};

export interface CurrentUser {
  id: string;
  sessionId: string;
  sub: string;
  name?: string;
  username?: string;
  email?: string;
  emailVerified: boolean;
  authTime: Date;
}

const stateHash = (state: string) => createHash('sha256').update(state).digest('hex');

export function cookieOptions() {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: AUTH.sessionTtlSeconds,
  };
}

function authTimeOf(claims: IdTokenClaims, required: boolean): number {
  const value = claims.auth_time;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (required) {
    throw new AppError('UNAUTHENTICATED', 'Please confirm your sign-in again.', 401);
  }
  return Math.floor(Date.now() / 1000);
}

function asUser(claims: IdTokenClaims, options: { requireAuthTime?: boolean } = {}): StoredUser {
  if (!claims.sub) throw new AppError('UNAUTHENTICATED', 'Sign-in did not return a valid user.', 401);
  return {
    sub: claims.sub,
    auth_time: authTimeOf(claims, Boolean(options.requireAuthTime)),
    ...(typeof claims.name === 'string' && { name: claims.name }),
    ...(typeof claims.preferred_username === 'string' && { username: claims.preferred_username }),
    ...(typeof claims.email === 'string' && { email: claims.email }),
    ...(typeof claims.email_verified === 'boolean' && { email_verified: claims.email_verified }),
  };
}

export async function beginSignIn(
  returnTo: string | null,
  options: { stepUp?: boolean } = {},
): Promise<string> {
  const stepUp = Boolean(options.stepUp);
  const request = await authClient().createAuthorizationRequest();
  const now = new Date();

  await db.delete(oidcAuthRequests).where(lt(oidcAuthRequests.expiresAt, now));
  await db.delete(authSessions).where(lt(authSessions.expiresAt, now));
  await db.insert(oidcAuthRequests).values({
    stateHash: stateHash(request.state),
    encryptedContext: encrypt({
      state: request.state,
      nonce: request.nonce,
      codeVerifier: request.codeVerifier,
      redirectUri: request.redirectUri,
      returnTo: safeReturnTo(returnTo),
      stepUp,
    } satisfies AuthContext),
    expiresAt: new Date(now.getTime() + AUTH.authRequestTtlSeconds * 1000),
  });

  const url = new URL(request.url);
  if (stepUp) {
    url.searchParams.set('prompt', 'login');
    url.searchParams.set('max_age', String(AUTH.stepUpMaxAgeSeconds));
  }
  return url.toString();
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
  if (callback.searchParams.has('error')) {
    throw new AppError('UNAUTHENTICATED', 'Sign-in was not completed.', 401);
  }

  const context = decrypt<AuthContext>(pending.encryptedContext);
  const tokens = await authClient().exchangeCode(callback, context);
  if (!tokens.claims) throw new AppError('UNAUTHENTICATED', 'Sign-in did not return a verified identity.', 401);
  const user = asUser(tokens.claims, { requireAuthTime: context.stepUp });

  const authAge = Date.now() / 1000 - (user.auth_time ?? 0);
  if (context.stepUp && (authAge < -30 || authAge > AUTH.stepUpMaxAgeSeconds + 30)) {
    throw new AppError('UNAUTHENTICATED', 'Please confirm your sign-in again.', 401);
  }

  const [payUser] = await db
    .insert(payUsers)
    .values({ accountsSub: user.sub, displayName: user.name ?? null })
    .onConflictDoUpdate({
      target: payUsers.accountsSub,
      set: { displayName: sql`coalesce(excluded.display_name, ${payUsers.displayName})` },
    })
    .returning({ id: payUsers.id });
  if (!payUser) throw new AppError('INTERNAL', 'Could not create the Pay account.');
  await syncContacts(payUser.id, tokens.claims);
  await ensureWallet(payUser.id, 'pay');

  const sessionId = randomBytes(32).toString('hex');
  await db.insert(authSessions).values({
    id: sessionId,
    userId: payUser.id,
    user,
    encryptedTokens: encrypt(tokens),
    expiresAt: sessionExpiry(tokens),
  });

  const previous = (await cookies()).get(SESSION_COOKIE)?.value;
  if (previous && SESSION_ID.test(previous)) {
    await db.delete(authSessions).where(eq(authSessions.id, previous));
  }

  return { sessionId, returnTo: context.returnTo };
}

export const getUser = cache(async (): Promise<CurrentUser | null> => {
  const sessionId = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!sessionId || !SESSION_ID.test(sessionId)) return null;

  const session = await resolveSession(sessionId);
  if (!session) return null;

  const { user } = session;
  return {
    id: session.userId,
    sessionId: session.id,
    sub: user.sub,
    name: user.name,
    username: user.username,
    email: user.email,
    emailVerified: user.email_verified === true,
    authTime: new Date((user.auth_time ?? session.createdAt.getTime() / 1000) * 1000),
  };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getUser();
  if (!user) redirect(new URL('/auth/login', env.APP_URL).toString());
  return user;
}

export async function requireApiUser(): Promise<CurrentUser> {
  const user = await getUser();
  if (!user) throw new AppError('UNAUTHENTICATED', 'Sign in to continue.', 401);
  return user;
}

export async function requireMoneyUser(): Promise<CurrentUser> {
  const user = await requireApiUser();
  if (!user.emailVerified) {
    throw new AppError('EMAIL_NOT_VERIFIED', 'Verify your email to continue.', 403);
  }
  await assertNotSuspended(user.sub);
  return user;
}

export function requireRecentAuth(
  user: CurrentUser,
  options: { maxAgeSeconds?: number; returnTo?: string } = {},
): void {
  const maxAge = options.maxAgeSeconds ?? AUTH.stepUpMaxAgeSeconds;
  if (Date.now() - user.authTime.getTime() <= maxAge * 1000) return;

  const params = new URLSearchParams({ stepUp: '1' });
  if (options.returnTo) params.set('returnTo', options.returnTo);
  throw new AppError('STEP_UP_REQUIRED', 'Confirm it is you to continue.', 403, {
    loginUrl: `/auth/login?${params.toString()}`,
  });
}

export async function signOut(): Promise<string> {
  const signedOut = new URL('/signed-out', env.APP_URL).toString();
  const sessionId = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!sessionId || !SESSION_ID.test(sessionId)) return signedOut;

  const [session] = await db.delete(authSessions).where(eq(authSessions.id, sessionId)).returning();
  if (!session) return signedOut;

  try {
    const tokens = decrypt<TokenSet>(session.encryptedTokens);
    const client = authClient();
    if (tokens.refreshToken) await client.revoke(tokens.refreshToken);
    if (tokens.idToken) {
      return await client.endSessionUrl({ idTokenHint: tokens.idToken, postLogoutRedirectUri: signedOut });
    }
  } catch (error) {
    logger.warn('sign-out cleanup failed', { error });
  }
  return signedOut;
}
