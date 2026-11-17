import 'server-only';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { MERCHANT_RULES } from '@/config/merchants';
import { env } from '@/env';
import { isUniqueViolation } from '@/lib/db-errors';
import { AppError } from '@/lib/errors';
import { parseServiceClients } from '@/lib/service-clients';
import type { AdminIdentity } from '@/modules/admin/identity';
import type { AdminWriteAudit } from '@/modules/admin/internal-route';
import { db } from '@/server/db/client';
import { ledgerAccounts, merchantEvents, merchants } from '@/server/db/schema';

export const createMerchantInput = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(2, 'Enter the merchant name.').max(120, 'Merchant name is too long.'),
  clientId: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9._-]{1,64}$/, 'Client ID may use letters, numbers, dots, dashes and underscores.'),
  returnUrl: z.string().trim().min(1, 'Enter the return URL.').max(2048, 'Return URL is too long.'),
});

export type MerchantAction = 'approve' | 'suspend' | 'reactivate';

const TRANSITIONS = {
  approve: { from: 'pending', to: 'active' },
  suspend: { from: 'active', to: 'suspended' },
  reactivate: { from: 'suspended', to: 'active' },
} as const;

const PUBLIC = {
  id: merchants.id,
  name: merchants.name,
  clientId: merchants.clientId,
  returnUrl: merchants.returnUrl,
  status: merchants.status,
  approvedAt: merchants.approvedAt,
  createdAt: merchants.createdAt,
};

function normalizeReturnUrl(value: string): string {
  const invalid = () => new AppError('VALIDATION_FAILED', 'Enter a valid return URL.', 422);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw invalid();
  }
  const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  const schemeOk =
    url.protocol === 'https:' || (env.NODE_ENV !== 'production' && url.protocol === 'http:' && isLocal);
  if (!schemeOk || url.username || url.password || url.hash) {
    throw new AppError(
      'VALIDATION_FAILED',
      env.NODE_ENV === 'production' ? 'Return URL must use HTTPS.' : 'Enter a valid return URL.',
      422,
    );
  }
  return url.href;
}

function assertClientIdAllowed(clientId: string) {
  const registry = parseServiceClients(env.SERVICE_CLIENTS);
  if (clientId === env.ACCOUNTS_CLIENT_ID || (registry.ok && registry.clients.has(clientId))) {
    throw new AppError('VALIDATION_FAILED', 'That client ID is not available.', 422);
  }
}

export async function createMerchant(
  input: z.infer<typeof createMerchantInput>,
  admin: AdminIdentity,
  audit: AdminWriteAudit,
) {
  const returnUrl = normalizeReturnUrl(input.returnUrl);
  assertClientIdAllowed(input.clientId);

  try {
    return await db.transaction(async (tx) => {
      const [account] = await tx
        .insert(ledgerAccounts)
        .values({ kind: 'wallet', normalSide: 'credit' })
        .returning({ id: ledgerAccounts.id });
      if (!account) throw new AppError('INTERNAL', 'Could not create the merchant account.');

      const [merchant] = await tx
        .insert(merchants)
        .values({
          ...(input.id ? { id: input.id } : {}),
          name: input.name,
          clientId: input.clientId,
          returnUrl,
          ledgerAccountId: account.id,
          status: 'pending',
          createdBy: admin.actorId,
        })
        .returning(PUBLIC);
      if (!merchant) throw new AppError('INTERNAL', 'Could not create the merchant.');

      await tx.insert(merchantEvents).values({
        merchantId: merchant.id,
        action: 'create',
        fromStatus: null,
        toStatus: 'pending',
        actorId: admin.actorId,
        actorEmail: admin.email,
        reason: audit.reason,
        requestId: audit.requestId,
        ip: audit.actorIp,
      });
      return merchant;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError('CONFLICT', 'A merchant with that client ID already exists.', 409);
    }
    throw error;
  }
}

export async function transitionMerchant(
  id: string,
  action: MerchantAction,
  admin: AdminIdentity,
  audit: AdminWriteAudit,
) {
  if (!z.uuid().safeParse(id).success) throw new AppError('NOT_FOUND', 'Merchant not found.', 404);
  const rule = TRANSITIONS[action];

  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(merchants).where(eq(merchants.id, id)).for('update');
    if (!current) throw new AppError('NOT_FOUND', 'Merchant not found.', 404);
    if (current.status !== rule.from) {
      throw new AppError('CONFLICT', `This merchant is ${current.status}.`, 409);
    }
    if (action === 'approve' && MERCHANT_RULES.separateApprover && current.createdBy === admin.actorId) {
      throw new AppError('APPROVER_MUST_DIFFER', 'Another admin must approve this merchant.', 403);
    }

    const [merchant] = await tx
      .update(merchants)
      .set({
        status: rule.to,
        ...(action === 'approve' ? { approvedBy: admin.actorId, approvedAt: new Date() } : {}),
      })
      .where(eq(merchants.id, id))
      .returning(PUBLIC);
    if (!merchant) throw new AppError('INTERNAL', 'Could not update the merchant.');

    await tx.insert(merchantEvents).values({
      merchantId: id,
      action,
      fromStatus: current.status,
      toStatus: rule.to,
      actorId: admin.actorId,
      actorEmail: admin.email,
      reason: audit.reason,
      requestId: audit.requestId,
      ip: audit.actorIp,
    });
    return { merchant, previousStatus: current.status };
  });
}
