import 'server-only';
import { env } from '@/env';
import { AppError } from '@/lib/errors';
import type { PaymentProvider } from './types';

export type { PaymentProvider, ProviderEvent, ProviderEventType } from './types';
export { mapProviderError, ProviderError } from './errors';

/** Add one line per adapter. This is the only place drivers are registered. */
const DRIVERS: Record<string, () => Promise<PaymentProvider>> = {
  mock: async () => (await import('./mock')).mockProvider,
};

let cached: Promise<PaymentProvider> | undefined;

/** Resolved lazily so builds and CI never need a live adapter. */
export function getProvider(): Promise<PaymentProvider> {
  const load = DRIVERS[env.PAYMENTS_DRIVER];
  if (!load) throw new AppError('SERVICE_UNAVAILABLE', 'Payments are not configured.', 503);
  return (cached ??= load());
}
