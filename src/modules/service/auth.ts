import 'server-only';
import { createHash } from 'node:crypto';
import { SERVICE_API } from '@/config/service';
import { env } from '@/env';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { parseServiceClients, type ClientRegistry } from '@/lib/service-clients';
import type { ServiceCaller } from './types';

interface Verified {
  clientId: string;
  scopes: string[];
  expires: number;
}

const cache = new Map<string, Verified>();
let introspectionEndpoint: string | undefined;
let clients: ClientRegistry | undefined;

const timeout = () => AbortSignal.timeout(SERVICE_API.httpTimeoutMs);
const unauthenticated = () => new AppError('UNAUTHENTICATED', 'Service authentication required.', 401);

function registry(): ClientRegistry {
  if (!clients) {
    const parsed = parseServiceClients(env.SERVICE_CLIENTS);
    if (!parsed.ok) throw new AppError('SERVICE_UNAVAILABLE', 'The service API is not configured.', 503);
    clients = parsed.clients;
  }
  return clients;
}

function bearerToken(request: Request): string {
  const match = /^Bearer ([A-Za-z0-9\-._~+/]+=*)$/i.exec(request.headers.get('authorization') ?? '');
  const token = match?.[1];
  if (!token || token.length > 4096) throw unauthenticated();
  return token;
}

async function discoverEndpoint(): Promise<string> {
  if (introspectionEndpoint) return introspectionEndpoint;
  const issuer = env.ACCOUNTS_ISSUER.replace(/\/+$/, '');
  const response = await fetch(`${issuer}/.well-known/openid-configuration`, { signal: timeout() });
  const body = (await response.json().catch(() => null)) as { introspection_endpoint?: string } | null;
  if (!response.ok || !body?.introspection_endpoint) {
    throw new Error('OIDC discovery did not return an introspection endpoint.');
  }
  introspectionEndpoint = body.introspection_endpoint;
  return introspectionEndpoint;
}

/** RFC 7662. Pay authenticates to Accounts with its own client credentials. */
async function introspect(token: string): Promise<Verified | null> {
  const basic = Buffer.from(
    `${encodeURIComponent(env.ACCOUNTS_CLIENT_ID)}:${encodeURIComponent(env.ACCOUNTS_CLIENT_SECRET)}`,
  ).toString('base64');
  const response = await fetch(await discoverEndpoint(), {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
      authorization: `Basic ${basic}`,
    },
    body: new URLSearchParams({ token, token_type_hint: 'access_token' }),
    signal: timeout(),
  });
  if (!response.ok) throw new Error(`Introspection rejected (${response.status}).`);

  const body: unknown = await response.json();
  if (typeof body !== 'object' || body === null || !('active' in body) || typeof body.active !== 'boolean') {
    throw new Error('Introspection returned an invalid response.');
  }
  if (!body.active) return null;

  const record = body as Record<string, unknown>;
  const clientId = typeof record.client_id === 'string' ? record.client_id : null;
  const exp = typeof record.exp === 'number' ? record.exp * 1000 : null;
  if (!clientId || (exp !== null && exp <= Date.now())) return null;

  return {
    clientId,
    scopes: typeof record.scope === 'string' ? record.scope.split(' ').filter(Boolean) : [],
    expires: Math.min(Date.now() + SERVICE_API.introspectionCacheSeconds * 1000, exp ?? Infinity),
  };
}

async function verify(token: string): Promise<Verified | null> {
  const key = createHash('sha256').update(token).digest('hex');
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit;
  cache.delete(key);

  let verified: Verified | null;
  try {
    verified = await introspect(token);
  } catch (error) {
    logger.error('service token introspection failed', { error });
    throw new AppError('SERVICE_UNAVAILABLE', 'We could not verify this request. Try again shortly.', 503);
  }
  if (verified) {
    if (cache.size >= SERVICE_API.maxCacheEntries) cache.clear();
    cache.set(key, verified);
  }
  return verified;
}

export async function authenticateService(request: Request): Promise<ServiceCaller> {
  const verified = await verify(bearerToken(request));
  if (!verified) throw unauthenticated();

  const product = registry().get(verified.clientId);
  if (!product || !verified.scopes.includes(SERVICE_API.requiredScope)) {
    throw new AppError('FORBIDDEN', 'This client is not allowed to use the service API.', 403);
  }
  return { clientId: verified.clientId, product };
}
