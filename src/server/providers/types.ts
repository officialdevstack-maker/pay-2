import 'server-only';
import type { Kobo } from '@/lib/money';

export interface Bank {
  code: string;
  name: string;
}

export interface ResolvedAccount {
  bankCode: string;
  accountNumber: string;
  accountName: string;
}

export interface FundingAccount {
  accountNumber: string;
  accountName: string;
  bankName: string;
  /** Internal provider reference. Never serialise to the client. */
  providerRef: string;
}

export interface TransferRequest {
  /** Our own reference (SPY_...), also the idempotency handle at the provider. */
  reference: string;
  amount: Kobo;
  bankCode: string;
  accountNumber: string;
  accountName: string;
  narration?: string;
}

export type TransferStatus = 'pending' | 'success' | 'failed';

export interface TransferResult {
  status: TransferStatus;
  providerRef: string | null;
}

interface BaseEvent {
  /** Unique per provider event. Used for dedupe and as the ledger idempotency key. */
  eventId: string;
  occurredAt: Date;
}

export type ProviderEvent =
  | (BaseEvent & {
      type: 'funding.received';
      accountNumber: string;
      amount: Kobo;
      senderName: string | null;
    })
  | (BaseEvent & { type: 'payout.succeeded'; reference: string })
  | (BaseEvent & { type: 'payout.failed'; reference: string })
  | (BaseEvent & { type: 'payout.reversed'; reference: string });

export type ProviderEventType = ProviderEvent['type'];

export interface PaymentProvider {
  readonly driver: string;
  listBanks(): Promise<Bank[]>;
  resolveAccount(input: { bankCode: string; accountNumber: string }): Promise<ResolvedAccount>;
  createFundingAccount(input: { userRef: string; name: string; email: string }): Promise<FundingAccount>;
  initiateTransfer(input: TransferRequest): Promise<TransferResult>;
  getTransferStatus(reference: string): Promise<TransferResult>;
  /** Must use constant-time comparison. Receives the exact raw body. */
  verifyWebhook(rawBody: string, headers: Headers): boolean;
  /** Returns null for events we do not care about. */
  parseWebhook(rawBody: string): ProviderEvent | null;
}
