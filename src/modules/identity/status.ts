import 'server-only';
import { AUTH } from '@/config/auth';
import { env } from '@/env';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';

const MAX_CACHE = 5_000;
const cache = new Map<string, { suspended: boolean; expires: number }>();

let tokenEndpoint: string | undefined;
let serviceToken: { value: string; expires: number } | undefined;
let pendingToken: Promise<string> | undefined;

const timeout = () => AbortSignal.timeout(AUTH.httpTimeoutMs);

async function getTokenEndpoint(): Promise<string> {
  if (tokenEndpoint) return tokenEndpoint;
  const issuer = env.ACCOUNTS_ISSUER.replace(/\/+$/, '');
  const response = await fetch(`${issuer}/.well-known/openid-configuration`, { signal: timeout() });
  const body = (await response.json().catch(() => null)) as { token_endpoint?: string } | null;
  if (!response.ok || !body?.token_endpoint) throw new Error('OIDC discovery failed.');
  tokenEndpoint = body.token_endpoint;
  return tokenEndpoint;
}

async function fetchServiceToken(): Promise<string> {
  const basic = Buffer.from(
    `${encodeURIComponent(env.ACCOUNTS_CLIENT_ID)}:${encodeURIComponent(env.ACCOUNTS_CLIENT_SECRET)}`,
  ).toString('base64');
  const response = await fetch(await getTokenEndpoint(), {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
      authorization: `Basic ${basic}`,
    },
    body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'users:read' }),
    signal: timeout(),
  });
  const body = (await response.json().catch(() => null)) as
    | { access_token?: string; expires_in?: number }
    | null;
  if (!response.ok || !body?.access_token) throw new Error(`Service token request failed (${response.status}).`);
  const expiresIn = typeof body.expires_in === 'number' && body.expires_in > 0 ? body.expires_in : 300;
  serviceToken = { value: body.access_token, expires: Date.now() + expiresIn * 1000 };
  return body.access_token;
}

function getServiceToken(): Promise<string> {
  if (serviceToken && serviceToken.expires - 30_000 > Date.now()) return Promise.resolve(serviceToken.value);
  pendingToken ??= fetchServiceToken().finally(() => {
    pendingToken = undefined;
  });
  return pendingToken;
}

const suspended = () => new AppError('ACCOUNT_SUSPENDED', 'This account cannot move money right now.', 403);
const unverifiable = () =>
  new AppError('SERVICE_UNAVAILABLE', 'We could not verify your account. Try again shortly.', 503);

export async function assertNotSuspended(sub: string): Promise<void> {
  const hit = cache.get(sub);
  if (hit && hit.expires > Date.now()) {
    if (hit.suspended) throw suspended();
    return;
  }

  let body: { suspendedAt: string | null };
  try {
    const url = new URL(`/api/internal/users/${encodeURIComponent(sub)}`, env.ACCOUNTS_ISSUER);
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${await getServiceToken()}`, accept: 'application/json' },
      signal: timeout(),
    });
    if (!response.ok) {
      if (response.status === 401) serviceToken = undefined;
      throw new Error(`Status check rejected (${response.status}).`);
    }
    const result: unknown = await response.json();
    if (
      typeof result !== 'object' ||
      result === null ||
      !('suspendedAt' in result) ||
      !(typeof result.suspendedAt === 'string' || result.suspendedAt === null)
    ) {
      throw new Error('Status check returned an invalid response.');
    }
    body = { suspendedAt: result.suspendedAt };
  } catch (error) {
    logger.error('account status check failed', { error });
    throw unverifiable();
  }

  const isSuspended = body.suspendedAt !== null;
  if (cache.size >= MAX_CACHE) cache.clear();
  cache.set(sub, { suspended: isSuspended, expires: Date.now() + AUTH.statusCacheSeconds * 1000 });
  if (isSuspended) throw suspended();
}
