import 'server-only';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '@/env';
import { ProviderError } from '../errors';
import type { PaymentProvider, ProviderEvent, TransferResult } from '../types';

const SECRET = () => env.PAYMENTS_WEBHOOK_HASH || 'mock-webhook-secret';
export const MOCK_SIGNATURE_HEADER = 'x-signature';

export function signMockWebhook(rawBody: string): string {
  return createHmac('sha256', SECRET()).update(rawBody).digest('hex');
}

const transfers = new Map<string, TransferResult>();

export const mockProvider: PaymentProvider = {
  driver: 'mock',

  async listBanks() {
    return [
      { code: '001', name: 'Sample Bank One' },
      { code: '002', name: 'Sample Bank Two' },
    ];
  },

  async resolveAccount({ bankCode, accountNumber }) {
    if (!/^\d{10}$/.test(accountNumber)) throw new ProviderError('ACCOUNT_NOT_FOUND', 'bad account number');
    return { bankCode, accountNumber, accountName: 'MOCK ACCOUNT HOLDER' };
  },

  async createFundingAccount({ userRef, name }) {
    const digits = createHash('sha256')
      .update(userRef)
      .digest()
      .readUInt32BE(0)
      .toString()
      .padStart(8, '0')
      .slice(-8);
    return {
      accountNumber: `99${digits}`,
      accountName: name,
      bankName: 'Sample Bank One',
      providerRef: `mock_${userRef}`,
    };
  },

  async initiateTransfer(input) {
    if (input.amount <= 0n) throw new ProviderError('REJECTED', 'amount must be positive');
    const existing = transfers.get(input.reference);
    if (existing) return existing;
    const result: TransferResult = { status: 'pending', providerRef: `mock_tr_${input.reference}` };
    transfers.set(input.reference, result);
    return result;
  },

  async getTransferStatus(reference) {
    const found = transfers.get(reference);
    if (!found) throw new ProviderError('ACCOUNT_NOT_FOUND', 'unknown transfer');
    return found;
  },

  verifyWebhook(rawBody, headers) {
    const given = headers.get(MOCK_SIGNATURE_HEADER);
    if (!given) return false;
    const expected = Buffer.from(signMockWebhook(rawBody));
    const actual = Buffer.from(given);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  },

  parseWebhook(rawBody): ProviderEvent | null {
    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return null;
    }
    if (!body || typeof body !== 'object') return null;
    const b = body as Record<string, unknown>;
    if (typeof b.id !== 'string' || typeof b.type !== 'string') return null;
    const base = { eventId: b.id, occurredAt: new Date(typeof b.at === 'string' ? b.at : Date.now()) };

    switch (b.type) {
      case 'funding.received': {
        if (typeof b.accountNumber !== 'string' || typeof b.amountKobo !== 'string') return null;
        if (!/^\d{1,15}$/.test(b.amountKobo)) return null;
        return {
          ...base,
          type: 'funding.received',
          accountNumber: b.accountNumber,
          amount: BigInt(b.amountKobo),
          senderName: typeof b.senderName === 'string' ? b.senderName : null,
        };
      }
      case 'payout.succeeded':
      case 'payout.failed':
      case 'payout.reversed':
        return typeof b.reference === 'string' ? { ...base, type: b.type, reference: b.reference } : null;
      default:
        return null;
    }
  },
};
