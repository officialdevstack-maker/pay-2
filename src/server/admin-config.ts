import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { CHECKOUT } from '@/config/checkout';
import { FEATURES } from '@/config/features';
import { FEES } from '@/config/fees';
import { RATE_RULES } from '@/config/rate-limits';
import { WALLET_LIMITS } from '@/config/limits';
import { env } from '@/env';
import { AppError } from '@/lib/errors';

const configResponse = z.object({
  app: z.literal('pay'),
  config: z.record(z.string(), z.string()),
});

const CACHE_MS = 30_000;
let cached: { expiresAt: number; config: Record<string, string> } | undefined;
let loading: Promise<Record<string, string>> | undefined;

const asNumber = (config: Record<string, string>, aliases: string[], fallback: number): number => {
  for (const alias of aliases) {
    const raw = config[alias];
    if (raw == null || raw.trim() === '') continue;
    const value = Number(raw);
    if (Number.isFinite(value)) return value;
  }
  return fallback;
};

const asBigInt = (config: Record<string, string>, aliases: string[], fallback: bigint): bigint => {
  for (const alias of aliases) {
    const raw = config[alias];
    if (raw == null || raw.trim() === '') continue;
    try {
      return BigInt(raw);
    } catch {
      // Try the next alias if a value is malformed.
    }
  }
  return fallback;
};

const asBoolean = (config: Record<string, string>, aliases: string[], fallback: boolean): boolean => {
  for (const alias of aliases) {
    const raw = config[alias];
    if (raw == null || raw.trim() === '') continue;
    const value = raw.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(value)) return true;
    if (['0', 'false', 'no', 'off'].includes(value)) return false;
  }
  return fallback;
};

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
    if (env.NODE_ENV === 'production' && url.protocol !== 'https:') {
      throw unavailable();
    }
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

export async function getPayPolicyConfig(): Promise<{
  checkout: {
    sessionTtlSeconds: number;
    attemptGraceSeconds: number;
    maxAmountKobo: bigint;
  };
  features: {
    cardTokenization: boolean;
  };
  fees: {
    cardFundingBps: number;
  };
  walletLimits: {
    pay: {
      perTransferKobo: bigint;
      dailyDebitKobo: bigint;
      maxBalanceKobo: bigint;
    };
    wallet: {
      perTransferKobo: bigint;
      dailyDebitKobo: bigint;
      maxBalanceKobo: bigint;
    };
  };
  rateRules: Record<string, { limit: number; windowSeconds: number }>;
}> {
  const config = await getAdminPayConfig().catch(() => ({} as Record<string, string>));

  type ManagedPolicy = {
    fees?: { cardFundingBps?: number };
    limits?: {
      perTransferKobo?: string;
      dailyDebitKobo?: string;
      maxBalanceKobo?: string;
      maxCheckoutAmountKobo?: string;
    };
    checkout?: { sessionTtlSeconds?: number; attemptGraceSeconds?: number };
    rateLimits?: Record<string, { limit: number; windowSeconds: number }>;
  };
  let managed: ManagedPolicy | null = null;
  if (config.PAY_POLICY) {
    try {
      managed = JSON.parse(config.PAY_POLICY) as ManagedPolicy;
    } catch {
      managed = null;
    }
  }

  const walletPerTransfer = managed?.limits?.perTransferKobo
    ? BigInt(managed.limits.perTransferKobo)
    : asBigInt(config, ['PAY_WALLET_PER_TRANSFER_KOBO', 'PAY_PER_TRANSFER_KOBO'], WALLET_LIMITS.pay.perTransferKobo);
  const walletDailyDebit = managed?.limits?.dailyDebitKobo
    ? BigInt(managed.limits.dailyDebitKobo)
    : asBigInt(config, ['PAY_WALLET_DAILY_DEBIT_KOBO', 'PAY_DAILY_DEBIT_KOBO'], WALLET_LIMITS.pay.dailyDebitKobo);
  const walletMaxBalance = managed?.limits?.maxBalanceKobo
    ? BigInt(managed.limits.maxBalanceKobo)
    : asBigInt(config, ['PAY_WALLET_MAX_BALANCE_KOBO', 'PAY_MAX_BALANCE_KOBO'], WALLET_LIMITS.pay.maxBalanceKobo);

  return {
    checkout: {
      sessionTtlSeconds: managed?.checkout?.sessionTtlSeconds
        ?? asNumber(config, ['PAY_CHECKOUT_SESSION_TTL_SECONDS', 'PAY_CHECKOUT_TTL_SECONDS', 'PAY_SESSION_TTL_SECONDS'], CHECKOUT.sessionTtlSeconds),
      attemptGraceSeconds: managed?.checkout?.attemptGraceSeconds
        ?? asNumber(config, ['PAY_BANK_TRANSFER_GRACE_SECONDS', 'PAY_ATTEMPT_GRACE_SECONDS', 'PAY_BANK_TRANSFER_GRACE_WINDOW_SECONDS'], CHECKOUT.attemptGraceSeconds),
      maxAmountKobo: managed?.limits?.maxCheckoutAmountKobo
        ? BigInt(managed.limits.maxCheckoutAmountKobo)
        : asBigInt(config, ['PAY_MAX_AMOUNT_KOBO', 'PAY_CHECKOUT_MAX_AMOUNT_KOBO'], CHECKOUT.maxAmountKobo),
    },
    features: {
      cardTokenization: asBoolean(config, ['PAY_CARD_TOKENIZATION', 'PAY_METHOD_CARD_TOKENIZATION', 'PAY_CARD_TOKENIZATION_ENABLED'], FEATURES.cardTokenization),
    },
    fees: {
      cardFundingBps: managed?.fees?.cardFundingBps
        ?? asNumber(config, ['PAY_CARD_FUNDING_BPS', 'PAY_FEE_CARD_FUNDING_BPS'], FEES.cardFundingBps),
    },
    walletLimits: {
      pay: {
        perTransferKobo: walletPerTransfer,
        dailyDebitKobo: walletDailyDebit,
        maxBalanceKobo: walletMaxBalance,
      },
      wallet: {
        perTransferKobo: walletPerTransfer,
        dailyDebitKobo: walletDailyDebit,
        maxBalanceKobo: walletMaxBalance,
      },
    },
    rateRules: managed?.rateLimits ?? RATE_RULES,
  };
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
