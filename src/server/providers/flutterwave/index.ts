import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { env } from '@/env';
import { logger } from '@/lib/logger';
import { parseNairaToKobo, type Kobo } from '@/lib/money';
import { ProviderError } from '../errors';
import { providerFetch } from '../http';
import type { PaymentProvider, ProviderEvent } from '../types';

const BASE = 'https://api.flutterwave.com/v3';

const nairaNumber = (kobo: Kobo) => Number(`${kobo / 100n}.${(kobo % 100n).toString().padStart(2, '0')}`);

const envelope = z.object({ status: z.string(), data: z.unknown() });

async function request(
  method: 'GET' | 'POST',
  path: string,
  options: { body?: unknown; retries?: number } = {},
): Promise<unknown> {
  const response = await providerFetch(`${BASE}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${env.PAYMENTS_SECRET_KEY}`,
      accept: 'application/json',
      ...(options.body ? { 'content-type': 'application/json' } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    timeoutMs: 15_000,
    retries: method === 'GET' ? (options.retries ?? 0) : 0,
  });

  if (response.status >= 500) throw new ProviderError('UNAVAILABLE', `upstream ${response.status}`);
  if (response.status === 401 || response.status === 403) {
    logger.error('provider credentials rejected', { status: response.status });
    throw new ProviderError('UNAVAILABLE', `upstream auth ${response.status}`);
  }

  const parsed = envelope.safeParse(await response.json().catch(() => null));
  if (!response.ok || !parsed.success || parsed.data.status !== 'success') {
    throw new ProviderError('REJECTED', `upstream rejected (${response.status})`);
  }
  return parsed.data.data;
}

const virtualAccount = z.object({
  account_number: z.string().regex(/^\d{10}$/),
  bank_name: z.string().min(1),
  flw_ref: z.string().min(1),
});

const verifiedTransaction = z.object({
  status: z.string(),
  amount: z.union([z.number(), z.string()]),
  currency: z.string().optional(),
  tx_ref: z.string().nullish(),
});

const chargeEvent = z.object({
  event: z.literal('charge.completed'),
  data: z.object({
    id: z.union([z.number(), z.string()]),
    status: z.string(),
    amount: z.union([z.number(), z.string()]),
    currency: z.string().optional(),
    tx_ref: z.string().nullish(),
    account_number: z.string().nullish(),
    created_at: z.string().nullish(),
    customer: z.object({ name: z.string().nullish() }).nullish(),
  }),
});

const notEnabled = (): never => {
  throw new ProviderError('UNAVAILABLE', 'not enabled for the checkout-only launch');
};

export const flutterwaveProvider: PaymentProvider = {
  driver: 'flutterwave',

  listBanks: async () => notEnabled(),
  resolveAccount: async () => notEnabled(),
  createFundingAccount: async () => notEnabled(),
  initiateTransfer: async () => notEnabled(),
  getTransferStatus: async () => notEnabled(),

  async createCheckoutAccount({ reference, amount, name }) {
    const host = new URL(env.APP_URL).hostname;
    const domain = host.includes('.') ? host : 'example.com';

    const raw = await request('POST', '/virtual-account-numbers', {
      body: {
        email: `pay+${reference.toLowerCase()}@${domain}`,
        firstname: 'Spurs',
        lastname: 'Pay',
        tx_ref: reference,
        amount: nairaNumber(amount),
        narration: `${name} checkout`,
      },
    });

    const parsed = virtualAccount.safeParse(raw);
    if (!parsed.success) {
      throw new ProviderError('REJECTED', 'virtual account payload was malformed');
    }

    return {
      accountNumber: parsed.data.account_number,
      accountName: name,
      bankName: parsed.data.bank_name,
      providerRef: parsed.data.flw_ref,
    };
  },

  verifyWebhook(rawBody, headers) {
    const given = headers.get('verif-hash') ?? headers.get('x-flw-signature');
    if (!given || !env.PAYMENTS_WEBHOOK_HASH) return false;
    const expected = Buffer.from(env.PAYMENTS_WEBHOOK_HASH);
    const actual = Buffer.from(given);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  },

  async confirmEvent(event) {
    if (event.type !== 'funding.received') return true;
    const reference = event.reference ?? event.accountNumber;
    if (!reference) return false;

    const result = await request('GET', `/transactions/verify_by_reference?tx_ref=${encodeURIComponent(reference)}`);
    const parsed = verifiedTransaction.safeParse(result);
    if (!parsed.success) return false;

    const rawAmount = typeof parsed.data.amount === 'number' ? parsed.data.amount : Number(parsed.data.amount);
    const providerAmount = Number.isFinite(rawAmount) ? BigInt(Math.round(rawAmount * 100)) : null;
    if (!providerAmount || providerAmount !== event.amount) return false;
    return parsed.data.status.toLowerCase() === 'successful' || parsed.data.status.toLowerCase() === 'success';
  },

  parseWebhook(rawBody): ProviderEvent | null {
    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return null;
    }

    if (!body || typeof body !== 'object') return null;
    const root = body as Record<string, unknown>;
    const eventType = typeof root.event === 'string' ? root.event : null;
    const data = root.data && typeof root.data === 'object' ? (root.data as Record<string, unknown>) : undefined;

    if (eventType === 'charge.completed' && data) {
      const parsed = chargeEvent.safeParse(body);
      if (!parsed.success) return null;

      const amount = parseNairaToKobo(String(parsed.data.data.amount));
      if (amount === null) return null;

      const accountNumber = typeof parsed.data.data.account_number === 'string' ? parsed.data.data.account_number : null;
      const reference = typeof parsed.data.data.tx_ref === 'string' ? parsed.data.data.tx_ref : null;
      return {
        eventId: String(parsed.data.data.id),
        occurredAt: new Date(typeof parsed.data.data.created_at === 'string' ? parsed.data.data.created_at : Date.now()),
        type: 'funding.received',
        accountNumber,
        reference,
        amount,
        senderName: parsed.data.data.customer?.name ?? null,
      };
    }

    return null;
  },
};
