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
