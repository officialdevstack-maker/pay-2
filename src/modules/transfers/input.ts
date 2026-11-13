import { z } from 'zod';
import { AppError } from '@/lib/errors';
import { parseNairaToKobo } from '@/lib/money';
import type { SendInput, SendResult } from './types';

const KEY = /^[A-Za-z0-9_-]{16,128}$/;

const body = z.object({
  recipient: z.string().min(1).max(40),
  amount: z.string().min(1).max(24),
  note: z.string().max(200).nullish(),
  pin: z.string().min(1).max(32),
});

const invalid = (message: string, fields?: string[]) =>
  new AppError('VALIDATION_FAILED', message, 422, fields ? { fields } : undefined);

function cleanNote(note: string | null | undefined): string | null {
  const cleaned = (note ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
  return cleaned.length > 0 ? cleaned : null;
}

export function parseSendRequest(raw: unknown, idempotencyKey: string | null): SendInput {
  if (!idempotencyKey || !KEY.test(idempotencyKey)) {
    throw new AppError('BAD_REQUEST', 'A valid Idempotency-Key header is required.', 400);
  }

  const parsed = body.safeParse(raw);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? '')))];
    throw invalid('Check the details and try again.', fields);
  }

  const amount = parseNairaToKobo(parsed.data.amount);
  if (amount === null) throw invalid('Enter a valid amount.', ['amount']);
  if (amount <= 0n) throw invalid('Enter an amount above ₦0.', ['amount']);

  return {
    recipientTag: parsed.data.recipient,
    amount,
    note: cleanNote(parsed.data.note),
    pin: parsed.data.pin,
    idempotencyKey,
  };
}

export function serializeSend(result: SendResult) {
  return {
    transfer: {
      reference: result.reference,
      amount: result.amount.toString(),
      currency: 'NGN',
      recipient: result.recipient,
      note: result.note,
      createdAt: result.createdAt.toISOString(),
    },
  };
}
