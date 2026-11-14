import type { Product } from '@/modules/wallet';

export interface Sender {
  id: string;
  name: string | null;
}

export interface SendInput {
  recipientTag: string;
  amount: bigint;
  note: string | null;
  pin: string;
  idempotencyKey: string;
}

export interface RecipientView {
  name: string;
  tag: string;
}

export interface SendResult {
  reference: string;
  amount: bigint;
  recipient: RecipientView;
  note: string | null;
  createdAt: Date;
  replayed: boolean;
}

export interface TransferCommand {
  product: Product;
  sender: Sender;
  recipient: { id: string; name?: string };
  amount: bigint;
  note: string | null;
  pin: string;
  idempotency: { scope: string; key: string };
  sideEffects: boolean;
}

export interface TransferOutcome {
  reference: string;
  createdAt: Date;
  replayed: boolean;
}
