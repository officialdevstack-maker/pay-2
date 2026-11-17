import { AppError } from '@/lib/errors';
import { route } from '@/lib/request';
import { internalAdminWriteRoute } from '@/modules/admin/internal-route';
import { transitionMerchant, type MerchantAction } from '@/modules/merchants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const make = (permission: 'pay.write' | 'pay.approve', action: MerchantAction) =>
  internalAdminWriteRoute(permission, async (request, { admin, audit }) => {
    const id = new URL(request.url).pathname.split('/').at(-2) ?? '';
    return Response.json(await transitionMerchant(id, action, admin, audit));
  });

const HANDLERS: Record<MerchantAction, ReturnType<typeof make>> = {
  approve: make('pay.approve', 'approve'),
  suspend: make('pay.write', 'suspend'),
  reactivate: make('pay.approve', 'reactivate'),
};

export const POST = route(async (request) => {
  const action = new URL(request.url).pathname.split('/').at(-1) ?? '';
  if (!Object.prototype.hasOwnProperty.call(HANDLERS, action)) {
    throw new AppError('NOT_FOUND', 'Not found.', 404);
  }
  return HANDLERS[action as MerchantAction](request, {});
});
