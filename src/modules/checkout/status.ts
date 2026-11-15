export type SessionStatus = 'open' | 'paid' | 'cancelled' | 'expired';
export type AttemptStatus = 'pending' | 'succeeded' | 'failed' | 'unknown';
export type PublicCheckoutStatus = 'open' | 'pending' | 'paid' | 'reversed' | 'cancelled' | 'expired';

export interface CheckoutStatusInput {
  sessionStatus: SessionStatus;
  expiresAt: Date;
  latestAttemptStatus: AttemptStatus | null;
  reversed: boolean;
  now: Date;
}

export function deriveCheckoutStatus(input: CheckoutStatusInput): PublicCheckoutStatus {
  if (input.sessionStatus === 'paid') return input.reversed ? 'reversed' : 'paid';
  if (input.sessionStatus === 'cancelled') return 'cancelled';
  if (input.sessionStatus === 'expired') return 'expired';
  if (input.latestAttemptStatus === 'pending' || input.latestAttemptStatus === 'unknown') return 'pending';
  if (input.expiresAt.getTime() <= input.now.getTime()) return 'expired';
  return 'open';
}

export function canStartAttempt(input: CheckoutStatusInput): boolean {
  return deriveCheckoutStatus(input) === 'open';
}
