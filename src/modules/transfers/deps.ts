import 'server-only';
import { formatNaira } from '@/lib/money';
import { rateLimit } from '@/lib/rate-limit';
import { notify } from '@/modules/notifications';
import { assertTransferAllowed, verifyPin } from '@/modules/wallet';
import type { Product } from '@/modules/wallet';
import type { Tx } from '@/server/db/client';

type Action = 'send' | 'lookup';

export async function enforceRate(action: Action, userId: string, ip?: string): Promise<void> {
  const rule = action === 'send' ? 'p2p_send' : 'recipient_lookup';
  const limits = [rateLimit(rule, userId)];
  if (ip) limits.push(rateLimit(`${rule}_ip`, ip));
  await Promise.all(limits);
}

export async function verifyTransactionPin(userId: string, pin: string): Promise<void> {
  await verifyPin(userId, 'pay', pin);
}

export async function assertCanSend(
  tx: Tx,
  input: { userId: string; recipientUserId: string; amount: bigint; product: Product },
): Promise<void> {
  await assertTransferAllowed(tx, input);
}

export async function notifyTransfer(input: {
  reference: string;
  amount: bigint;
  senderId: string;
  senderName: string | null;
  recipientId: string;
  recipientName: string;
}): Promise<void> {
  const money = formatNaira(input.amount, { hideZeroKobo: true });
  await Promise.all([
    notify(input.senderId, {
      type: 'transfer.sent',
      title: `You sent ${money}`,
      body: `To ${input.recipientName}`,
      reference: input.reference,
    }),
    notify(input.recipientId, {
      type: 'transfer.received',
      title: `You received ${money}`,
      body: `From ${input.senderName ?? 'a Spurs Pay user'}`,
      reference: input.reference,
    }),
  ]);
}
