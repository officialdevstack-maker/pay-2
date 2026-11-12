import { randomUUID } from 'node:crypto';
import { AppError, toErrorBody } from './errors';
import { logger } from './logger';

type Handler<C> = (
  request: Request,
  context: C & { requestId: string },
) => Promise<Response> | Response;

export function route<C = unknown>(handler: Handler<C>) {
  return async (request: Request, context: C): Promise<Response> => {
    const requestId = request.headers.get('x-request-id') ?? `req_${randomUUID()}`;
    try {
      const response = await handler(request, { ...context, requestId });
      response.headers.set('x-request-id', requestId);
      return response;
    } catch (error) {
      const { status, body } = toErrorBody(error, requestId);
      if (status >= 500) {
        logger.error('request failed', {
          requestId,
          path: new URL(request.url).pathname,
          error,
        });
      } else if (!(error instanceof AppError)) {
        logger.warn('unexpected non-app error', { requestId, error });
      }
      return Response.json(body, {
        status,
        headers: { 'x-request-id': requestId, 'cache-control': 'no-store' },
      });
    }
  };
}
