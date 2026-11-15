import 'server-only';
import { rateLimit } from '@/lib/rate-limit';
import { route } from '@/lib/request';
import { authenticateMerchant } from '@/modules/service';
import { findMerchantByClient } from './create';
import type { Merchant } from './types';

type Handler<C> = (request: Request, context: C & { requestId: string; merchant: Merchant }) => Promise<Response> | Response;

export function checkoutRoute<C = unknown>(handler: Handler<C>) {
  return route<C>(async (request, context) => {
    const { clientId } = await authenticateMerchant(request);
    await rateLimit('checkout_api', clientId);
    const merchant = await findMerchantByClient(clientId);
    const response = await handler(request, { ...context, merchant });
    response.headers.set('cache-control', 'no-store');
    return response;
  });
}
