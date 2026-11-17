import 'server-only';
import { env } from '@/env';
import { AppError } from '@/lib/errors';
import { rateLimit } from '@/lib/rate-limit';
import { route } from '@/lib/request';
import { hasAdminPermission, verifyAdminIdentityToken, type AdminIdentity } from './identity';

export type AdminWriteAudit = {
  reason: string;
  requestId: string;
  actorIp: string;
};

async function authenticateAdmin(request: Request, permission: string) {
  const publicKey = env.ADMIN_IDENTITY_PUBLIC_KEY.trim();
  if (!publicKey) {
    throw new AppError(
      'SERVICE_UNAVAILABLE',
      'The internal admin API is not configured.',
      503,
    );
  }
  const authorization = request.headers.get('authorization');
  const match = authorization?.match(/^Bearer ([^\s]+)$/i);
  const token = match?.[1];
  const admin = token
    ? verifyAdminIdentityToken(token, publicKey)
    : null;
  if (!admin) throw new AppError('FORBIDDEN', 'Admin identity is required.', 403);
  if (!hasAdminPermission(admin, permission)) {
    throw new AppError('FORBIDDEN', 'Admin permission denied.', 403);
  }

  await rateLimit('internal_admin', `admin:${admin.sub}`);
  return admin;
}

export function internalAdminRoute(
  handler: (request: Request, admin: AdminIdentity) => Promise<Response> | Response,
) {
  return route(async (request) => {
    const admin = await authenticateAdmin(request, 'pay.view');
    const response = await handler(request, admin);
    response.headers.set('cache-control', 'no-store');
    return response;
  });
}

export function internalAdminWriteRoute(
  permission: 'pay.write' | 'pay.approve',
  handler: (
    request: Request,
    context: { admin: AdminIdentity; audit: AdminWriteAudit },
  ) => Promise<Response> | Response,
) {
  return route(async (request, context) => {
    if (request.method === 'GET' || request.method === 'HEAD') {
      throw new AppError('BAD_REQUEST', 'Internal write routes require a write method.', 405);
    }

    const admin = await authenticateAdmin(request, permission);
    const ageSeconds = Date.now() / 1000 - admin.authTime;
    if (ageSeconds < 0 || ageSeconds > 300) {
      throw new AppError('STEP_UP_REQUIRED', 'Recent re-authentication is required.', 403, {
        maxAge: 300,
      });
    }

    const reason = request.headers.get('x-admin-audit-reason')?.trim() ?? '';
    const requestId = request.headers.get('x-admin-request-id')?.trim() ?? '';
    if (!reason || reason.length > 1000 || !requestId || requestId.length > 128) {
      throw new AppError(
        'BAD_REQUEST',
        'An audit reason and request ID are required for internal writes.',
        400,
      );
    }

    const response = await handler(request, {
      admin,
      audit: { reason, requestId, actorIp: admin.ip },
    });
    response.headers.set('cache-control', 'no-store');
    return response;
  });
}
