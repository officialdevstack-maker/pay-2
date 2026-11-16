import { AppError } from '@/lib/errors';

export const CHECKOUT_STATUSES = ['open', 'paid', 'cancelled', 'expired'] as const;
export type AdminCheckoutStatus = (typeof CHECKOUT_STATUSES)[number];

export function parseAdminCheckoutsQuery(searchParams: URLSearchParams) {
  const rawLimit = searchParams.get('limit');
  const limit = rawLimit === null ? 50 : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new AppError('BAD_REQUEST', 'Limit must be an integer between 1 and 100.', 422);
  }

  const rawStatus = searchParams.get('status');
  if (rawStatus !== null && !CHECKOUT_STATUSES.some((status) => status === rawStatus)) {
    throw new AppError('BAD_REQUEST', 'Status is not supported.', 422);
  }

  return {
    limit,
    status: rawStatus as AdminCheckoutStatus | null,
  };
}
