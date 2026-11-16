import 'server-only';
import { env } from '@/env';
import { AppError } from '@/lib/errors';
import { getAdminPayConfig } from '@/server/admin-config';
import type { PaymentProvider } from './types';

export type { PaymentProvider, ProviderEvent, ProviderEventType } from './types';
export { mapProviderError, ProviderError } from './errors';
export { isBrandSafe } from './brand';

/** Credentials and the active provider are resolved from Admin's encrypted config store. */
export async function getProvider(): Promise<PaymentProvider> {
  const config = await getAdminPayConfig();
  const provider = config.PAY_PROVIDER || 'sandbox';

  if (provider === 'sandbox') {
    if (env.NODE_ENV === 'production') {
      throw new AppError('SERVICE_UNAVAILABLE', 'Payments are not configured.', 503);
    }
    return (await import('./mock')).mockProvider;
  }
  if (provider === 'flutterwave') {
    const secretKey = config.PAY_FLUTTERWAVE_SECRET_KEY ?? '';
    const webhookHash = config.PAY_FLUTTERWAVE_WEBHOOK_SECRET ?? '';
    if (!secretKey || !webhookHash) {
      throw new AppError('SERVICE_UNAVAILABLE', 'Payment provider credentials are not configured.', 503);
    }
    const { createFlutterwaveProvider } = await import('./flutterwave');
    return createFlutterwaveProvider({ secretKey, webhookHash });
  }

  throw new AppError('SERVICE_UNAVAILABLE', 'The configured payment provider is not supported.', 503);
}
