import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { env } from '@/env';
import { AppError } from '@/lib/errors';

const configResponse = z.object({
  app: z.literal('pay'),
  config: z.record(z.string(), z.string()),
});

const CACHE_MS = 30_000;
let cached: { expiresAt: number; config: Record<string, string> } | undefined;
let loading: Promise<Record<string, string>> | undefined;

export async function getAdminPayConfig(): Promise<Record<string, string>> {
  if (cached && cached.expiresAt > Date.now()) return cached.config;
  if (loading) return loading;

  loading = fetchAdminPayConfig()
    .then((config) => {
      cached = { config, expiresAt: Date.now() + CACHE_MS };
      return config;
    })
    .finally(() => {
      loading = undefined;
    });

  return loading;
}

async function fetchAdminPayConfig(): Promise<Record<string, string>> {
  if (!env.ADMIN_CONFIG_URL) {
    if (env.NODE_ENV !== 'production') return {};
    throw unavailable();
  }
  if (!env.ADMIN_BOOTSTRAP_SECRET) throw unavailable();

  let response: Response;
  try {
    const url = new URL(env.ADMIN_CONFIG_URL);
    url.searchParams.set('app', 'pay');
    response = await fetch(url, {
      headers: { 'x-admin-bootstrap': env.ADMIN_BOOTSTRAP_SECRET },
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    throw unavailable();
  }

  if (!response.ok) throw unavailable();

  const parsed = configResponse.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw unavailable();
  return parsed.data.config;
}

export async function verifyProviderWebhookToken(providerId: string, token: string): Promise<boolean> {
  const config = await getAdminPayConfig();
  if ((config.PAY_PROVIDER || 'sandbox') !== providerId) return false;

  const expectedValue = config[`PAY_${providerId.toUpperCase()}_WEBHOOK_SECRET`] ?? '';
  if (!expectedValue) return false;
  const expected = Buffer.from(expectedValue);
  const provided = Buffer.from(token);
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

function unavailable(): AppError {
  return new AppError('SERVICE_UNAVAILABLE', 'Payment configuration is unavailable.', 503);
}
