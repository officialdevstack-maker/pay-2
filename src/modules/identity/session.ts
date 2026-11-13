import 'server-only';
import { eq } from 'drizzle-orm';
import type { TokenSet } from '@spurs/auth';
import { AUTH } from '@/config/auth';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { db } from '@/server/db/client';
import { authSessions } from '@/server/db/schema';
import { authClient } from './client';
import { decrypt, encrypt } from './seal';

export type SessionRow = typeof authSessions.$inferSelect;
export const SESSION_ID = /^[a-f0-9]{64}$/;

const nowSeconds = () => Date.now() / 1000;
const isFresh = (tokens: Pick<TokenSet, 'expiresAt'>) =>
  tokens.expiresAt > nowSeconds() + AUTH.tokenRefreshSkewSeconds;
const isInvalidGrant = (error: unknown) =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === 'invalid_grant';

export function sessionExpiry(tokens: Pick<TokenSet, 'refreshToken' | 'expiresAt'>): Date {
  const seconds = tokens.refreshToken ? nowSeconds() + AUTH.sessionTtlSeconds : tokens.expiresAt;
  return new Date(seconds * 1000);
}

const drop = (sessionId: string) => db.delete(authSessions).where(eq(authSessions.id, sessionId));

export async function resolveSession(sessionId: string): Promise<SessionRow | null> {
  const [session] = await db.select().from(authSessions).where(eq(authSessions.id, sessionId)).limit(1);
  if (!session) return null;

  if (session.expiresAt <= new Date()) {
    await drop(sessionId);
    return null;
  }

  let tokens: TokenSet;
  try {
    tokens = decrypt<TokenSet>(session.encryptedTokens);
  } catch {
    await drop(sessionId);
    return null;
  }
  return isFresh(tokens) ? session : refreshSession(sessionId);
}

async function refreshSession(sessionId: string): Promise<SessionRow | null> {
  return db.transaction(async (tx) => {
    const [session] = await tx
      .select()
      .from(authSessions)
      .where(eq(authSessions.id, sessionId))
      .for('update')
      .limit(1);
    if (!session) return null;

    let tokens: TokenSet;
    try {
      tokens = decrypt<TokenSet>(session.encryptedTokens);
    } catch {
      await tx.delete(authSessions).where(eq(authSessions.id, sessionId));
      return null;
    }
    if (isFresh(tokens)) return session;

    if (!tokens.refreshToken) {
      await tx.delete(authSessions).where(eq(authSessions.id, sessionId));
      return null;
    }

    let refreshed: TokenSet;
    try {
      refreshed = await authClient().refresh(tokens.refreshToken);
    } catch (error) {
      if (isInvalidGrant(error)) {
        await tx.delete(authSessions).where(eq(authSessions.id, sessionId));
        return null;
      }
      logger.error('token refresh failed', { error });
      throw new AppError('SERVICE_UNAVAILABLE', 'Sign-in is temporarily unavailable. Try again shortly.', 503);
    }

    const [updated] = await tx
      .update(authSessions)
      .set({ encryptedTokens: encrypt(refreshed), expiresAt: sessionExpiry(refreshed) })
      .where(eq(authSessions.id, sessionId))
      .returning();
    return updated ?? null;
  });
}
