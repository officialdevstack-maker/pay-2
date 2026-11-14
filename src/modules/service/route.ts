import 'server-only';
import { rateLimit } from '@/lib/rate-limit';
import { route } from '@/lib/request';
import { authenticateService } from './auth';
import type { ServiceCaller } from './types';

type ServiceHandler = (
  request: Request,
  context: { requestId: string; caller: ServiceCaller },
) => Promise<Response> | Response;

/** Bearer-only. Cookies are never read, so CSRF does not apply and a browser session can never reach these routes. */
export function serviceRoute(handler: ServiceHandler) {
  return route(async (request, { requestId }) => {
    const caller = await authenticateService(request);
    await rateLimit('service_client', caller.clientId);
    const response = await handler(request, { requestId, caller });
    response.headers.set('cache-control', 'no-store');
    return response;
  });
}
