import 'server-only';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';

export type ProviderErrorKind =
  | 'ACCOUNT_NOT_FOUND'
  | 'REJECTED'
  | 'INSUFFICIENT_PROVIDER_FUNDS'
  | 'TIMEOUT'
  | 'UNAVAILABLE'
  | 'UNKNOWN';

/** Thrown inside adapters only. Never reaches a client; use mapProviderError at the boundary. */
export class ProviderError extends Error {
  constructor(
    readonly kind: ProviderErrorKind,
    message: string,
    readonly raw?: unknown,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

/** Provider detail goes to server logs only. The user gets our codes and our words. */
export function mapProviderError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  const kind: ProviderErrorKind = error instanceof ProviderError ? error.kind : 'UNKNOWN';
  logger.error('provider call failed', { kind, error });

  switch (kind) {
    case 'ACCOUNT_NOT_FOUND':
      return new AppError('ACCOUNT_NOT_FOUND', 'We could not find that account.', 404);
    case 'REJECTED':
      return new AppError('PAYOUT_FAILED', 'The transfer could not be completed.', 422);
    case 'INSUFFICIENT_PROVIDER_FUNDS':
      return new AppError('PAYOUT_UNAVAILABLE', 'Transfers are unavailable right now. Try again later.', 503);
    case 'TIMEOUT':
    case 'UNAVAILABLE':
      return new AppError('SERVICE_UNAVAILABLE', 'This service is temporarily unavailable. Try again shortly.', 503);
    default:
      return new AppError('INTERNAL', 'Something went wrong on our side. Try again.', 500);
  }
}
