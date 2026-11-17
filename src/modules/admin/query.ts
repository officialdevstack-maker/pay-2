import { AppError } from '@/lib/errors';

export const CHECKOUT_STATUSES = ['open', 'paid', 'cancelled', 'expired'] as const;
export type AdminCheckoutStatus = (typeof CHECKOUT_STATUSES)[number];

export type AdminCheckoutCursor = { createdAt: string; reference: string };

function parseLimit(searchParams: URLSearchParams) {
  const rawLimit = searchParams.get('limit');
  const limit = rawLimit === null ? 50 : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new AppError('BAD_REQUEST', 'Limit must be an integer between 1 and 100.', 422);
  }
  return limit;
}

function parseDate(searchParams: URLSearchParams, name: string) {
  const raw = searchParams.get(name);
  if (raw === null) return null;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw);
  const value = new Date(raw);
  if (!Number.isFinite(value.getTime())) {
    throw new AppError('BAD_REQUEST', `${name} must be a valid date.`, 422);
  }
  if (dateOnly && value.toISOString().slice(0, 10) !== raw) {
    throw new AppError('BAD_REQUEST', `${name} must be a valid date.`, 422);
  }
  if (name === 'to' && dateOnly) {
    value.setUTCHours(23, 59, 59, 999);
  }
  return value;
}

function parseOptionalText(searchParams: URLSearchParams, name: string, maxLength: number) {
  const value = searchParams.get(name)?.trim() ?? '';
  if (value.length > maxLength) {
    throw new AppError('BAD_REQUEST', `${name} is too long.`, 422);
  }
  return value || null;
}

export function decodeAdminCheckoutCursor(value: string | null): AdminCheckoutCursor | null {
  if (value === null) return null;
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid cursor.');
    const decoded = Buffer.from(value, 'base64url');
    if (decoded.toString('base64url') !== value) throw new Error('Invalid cursor.');
    const parsed: unknown = JSON.parse(decoded.toString('utf8'));
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('createdAt' in parsed) ||
      !('reference' in parsed) ||
      typeof parsed.createdAt !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(parsed.createdAt) ||
      typeof parsed.reference !== 'string' ||
      !/^SPY_[A-Z0-9]{16}$/.test(parsed.reference)
    ) {
      throw new Error('Invalid cursor.');
    }
    const parsedDate = new Date(parsed.createdAt);
    if (
      !Number.isFinite(parsedDate.getTime()) ||
      parsedDate.toISOString().slice(0, 10) !== parsed.createdAt.slice(0, 10)
    ) {
      throw new Error('Invalid cursor.');
    }
    return { createdAt: parsed.createdAt, reference: parsed.reference };
  } catch {
    throw new AppError('BAD_REQUEST', 'Cursor is not valid.', 422);
  }
}

export function encodeAdminCheckoutCursor(cursor: AdminCheckoutCursor) {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

export function parseAdminCheckoutsQuery(searchParams: URLSearchParams) {
  const rawStatus = searchParams.get('status');
  if (rawStatus !== null && !CHECKOUT_STATUSES.some((status) => status === rawStatus)) {
    throw new AppError('BAD_REQUEST', 'Status is not supported.', 422);
  }

  const from = parseDate(searchParams, 'from');
  const to = parseDate(searchParams, 'to');
  if (from && to && from > to) {
    throw new AppError('BAD_REQUEST', 'from must be earlier than or equal to to.', 422);
  }

  return {
    limit: parseLimit(searchParams),
    status: rawStatus as AdminCheckoutStatus | null,
    merchant: parseOptionalText(searchParams, 'merchant', 100),
    from,
    to,
    reference: parseOptionalText(searchParams, 'reference', 100),
    cursor: decodeAdminCheckoutCursor(searchParams.get('cursor')),
  };
}

export function parseAdminListQuery<T extends string>(
  searchParams: URLSearchParams,
  statuses: readonly T[],
) {
  const status = parseOptionalText(searchParams, 'status', 20);
  if (status !== null && !statuses.includes(status as T)) {
    throw new AppError('BAD_REQUEST', 'Status is not supported.', 422);
  }
  return {
    limit: parseLimit(searchParams),
    status: status as T | null,
    search: parseOptionalText(searchParams, 'search', 100),
  };
}

export function parseAdminSuspenseQuery(searchParams: URLSearchParams) {
  const rawCursor = searchParams.get('cursor');
  let cursor: bigint | null = null;
  if (rawCursor !== null) {
    if (!/^[1-9]\d*$/.test(rawCursor)) {
      throw new AppError('BAD_REQUEST', 'Cursor is not valid.', 422);
    }
    cursor = BigInt(rawCursor);
  }
  return { limit: parseLimit(searchParams), cursor };
}
