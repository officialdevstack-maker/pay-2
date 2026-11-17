import 'server-only';
import { isIP } from 'node:net';
import { and, asc, desc, eq, inArray, lt, notExists, sql } from 'drizzle-orm';
import { z } from 'zod';
import { env } from '@/env';
import { AppError } from '@/lib/errors';
import { db, type Tx } from '@/server/db/client';
import {
  checkoutAttempts,
  checkoutSessions,
  merchantEvents,
  merchantOnboarding,
  merchantWebhookAttempts,
  merchantWebhookConfigs,
  merchantWebhookDeliveries,
  merchants,
} from '@/server/db/schema';
import type { AdminIdentity } from '@/modules/admin/identity';
import type { AdminWriteAudit } from '@/modules/admin/internal-route';
import { decryptSigningSecret, encryptSigningSecret, newSigningSecret } from './crypto';

export const MERCHANT_WEBHOOK_EVENTS = [
  'payment.succeeded',
  'payment.reversed',
  'checkout.expired',
] as const;

const DEFAULT_ATTEMPTS = 8;
const DEFAULT_CHECKLIST = {
  registrationVerified: false,
  ownershipVerified: false,
  settlementAccountVerified: false,
  riskReviewComplete: false,
};

const webhookInput = z.object({
  url: z.string().trim().min(1).max(2048),
  maxAttempts: z.number().int().min(1).max(DEFAULT_ATTEMPTS).default(DEFAULT_ATTEMPTS),
  enabled: z.boolean().default(true),
});

export type MerchantWebhookInput = z.infer<typeof webhookInput>;

const onboardingInput = z.object({
  checklist: z.object({
    registrationVerified: z.boolean(),
    ownershipVerified: z.boolean(),
    settlementAccountVerified: z.boolean(),
    riskReviewComplete: z.boolean(),
  }),
  dueDiligenceNotes: z.string().max(5000),
});

export type MerchantOnboardingInput = z.infer<typeof onboardingInput>;

function assertUuid(id: string) {
  if (!z.uuid().safeParse(id).success) throw new AppError('NOT_FOUND', 'Merchant not found.', 404);
}

function ipv4IsPublic(address: string) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [a, b] = parts as [number, number, number, number];
  if (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 88 || b === 168)) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && parts[2] === 100) ||
    (a === 203 && b === 0 && parts[2] === 113) ||
    a >= 224
  ) {
    return false;
  }
  return true;
}

function ipIsPublic(address: string) {
  const version = isIP(address);
  if (version === 4) return ipv4IsPublic(address);
  if (version !== 6) return false;
  const value = address.toLowerCase();
  if (
    value.startsWith('::') ||
    value.startsWith('fc') ||
    value.startsWith('fd') ||
    /^fe[89ab]/.test(value) ||
    value.startsWith('ff') ||
    value.startsWith('2001:db8:')
  ) {
    return false;
  }
  return true;
}

export function normalizeMerchantWebhookUrl(value: string) {
  const invalid = () => new AppError('VALIDATION_FAILED', 'Enter a valid HTTPS webhook URL.', 422);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw invalid();
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const loopback = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  const schemeOk =
    url.protocol === 'https:' ||
    (env.NODE_ENV !== 'production' && url.protocol === 'http:' && loopback);
  if (
    !schemeOk ||
    url.username ||
    url.password ||
    url.hash ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.localhost') ||
    (isIP(hostname) !== 0 && !ipIsPublic(hostname))
  ) {
    throw invalid();
  }
  return url.href;
}

export async function resolveWebhookDestination(value: string) {
  const { lookup } = await import('node:dns/promises');
  const url = new URL(value);
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (
    !addresses.length ||
    (env.NODE_ENV === 'production' && addresses.some(({ address }) => !ipIsPublic(address)))
  ) {
    throw new Error('Webhook destination resolves to a non-public address.');
  }
  return addresses[0]!;
}

async function recordMerchantEvent(
  tx: Tx,
  merchantId: string,
  action: string,
  admin: AdminIdentity,
  audit: AdminWriteAudit,
) {
  const [merchant] = await tx
    .select({ status: merchants.status })
    .from(merchants)
    .where(eq(merchants.id, merchantId))
    .limit(1);
  if (!merchant) throw new AppError('NOT_FOUND', 'Merchant not found.', 404);
  await tx.insert(merchantEvents).values({
    merchantId,
    action,
    fromStatus: merchant.status,
    toStatus: merchant.status,
    actorId: admin.actorId,
    actorEmail: admin.email,
    reason: audit.reason,
    requestId: audit.requestId,
    ip: audit.actorIp,
  });
}

export async function enqueueMerchantWebhook(
  tx: Tx,
  input: { merchantId: string; eventType: (typeof MERCHANT_WEBHOOK_EVENTS)[number]; eventKey: string; payload: Record<string, unknown> },
) {
  const [config] = await tx
    .select({
      enabled: merchantWebhookConfigs.enabled,
      eventTypes: merchantWebhookConfigs.eventTypes,
    })
    .from(merchantWebhookConfigs)
    .where(eq(merchantWebhookConfigs.merchantId, input.merchantId))
    .limit(1);
  if (!config?.enabled || !config.eventTypes.includes(input.eventType)) return;

  await tx
    .insert(merchantWebhookDeliveries)
    .values({
      merchantId: input.merchantId,
      eventKey: input.eventKey,
      eventType: input.eventType,
      payload: input.payload,
    })
    .onConflictDoNothing({ target: merchantWebhookDeliveries.eventKey });
}

export async function getMerchantWebhook(merchantId: string) {
  assertUuid(merchantId);
  const [config] = await db
    .select({
      url: merchantWebhookConfigs.url,
      eventTypes: merchantWebhookConfigs.eventTypes,
      maxAttempts: merchantWebhookConfigs.maxAttempts,
      enabled: merchantWebhookConfigs.enabled,
      createdAt: merchantWebhookConfigs.createdAt,
      updatedAt: merchantWebhookConfigs.updatedAt,
    })
    .from(merchantWebhookConfigs)
    .where(eq(merchantWebhookConfigs.merchantId, merchantId))
    .limit(1);
  if (!config) return { config: null, deliveries: [] };

  const deliveries = await db
    .select({
      id: merchantWebhookDeliveries.id,
      eventType: merchantWebhookDeliveries.eventType,
      status: merchantWebhookDeliveries.status,
      attempts: merchantWebhookDeliveries.attempts,
      nextAttemptAt: merchantWebhookDeliveries.nextAttemptAt,
      lastAttemptAt: merchantWebhookDeliveries.lastAttemptAt,
      lastStatusCode: merchantWebhookDeliveries.lastStatusCode,
      lastError: merchantWebhookDeliveries.lastError,
      deliveredAt: merchantWebhookDeliveries.deliveredAt,
      createdAt: merchantWebhookDeliveries.createdAt,
    })
    .from(merchantWebhookDeliveries)
    .where(eq(merchantWebhookDeliveries.merchantId, merchantId))
    .orderBy(desc(merchantWebhookDeliveries.createdAt))
    .limit(100);

  const attempts = deliveries.length
    ? await db
        .select({
          id: merchantWebhookAttempts.id,
          deliveryId: merchantWebhookAttempts.deliveryId,
          attemptNumber: merchantWebhookAttempts.attemptNumber,
          status: merchantWebhookAttempts.status,
          responseStatus: merchantWebhookAttempts.responseStatus,
          error: merchantWebhookAttempts.error,
          attemptedAt: merchantWebhookAttempts.attemptedAt,
          completedAt: merchantWebhookAttempts.completedAt,
        })
        .from(merchantWebhookAttempts)
        .where(inArray(merchantWebhookAttempts.deliveryId, deliveries.map(({ id }) => id)))
        .orderBy(asc(merchantWebhookAttempts.attemptedAt))
    : [];
  const attemptsByDelivery = new Map<string, typeof attempts>();
  for (const attempt of attempts) {
    const current = attemptsByDelivery.get(attempt.deliveryId) ?? [];
    current.push(attempt);
    attemptsByDelivery.set(attempt.deliveryId, current);
  }
  return {
    config,
    deliveries: deliveries.map((delivery) => ({
      ...delivery,
      attemptCount: delivery.attempts,
      attempts: attemptsByDelivery.get(delivery.id) ?? [],
    })),
  };
}

export async function createMerchantWebhook(
  merchantId: string,
  rawInput: unknown,
  admin: AdminIdentity,
  audit: AdminWriteAudit,
) {
  assertUuid(merchantId);
  const parsed = webhookInput.safeParse(rawInput);
  if (!parsed.success) {
    throw new AppError('VALIDATION_FAILED', parsed.error.issues[0]?.message ?? 'Invalid webhook settings.', 422);
  }
  const url = normalizeMerchantWebhookUrl(parsed.data.url);
  const signingSecret = newSigningSecret();

  const result = await db.transaction(async (tx) => {
    const [merchant] = await tx.select({ id: merchants.id }).from(merchants).where(eq(merchants.id, merchantId)).limit(1);
    if (!merchant) throw new AppError('NOT_FOUND', 'Merchant not found.', 404);
    const [config] = await tx
      .insert(merchantWebhookConfigs)
      .values({
        merchantId,
        url,
        signingSecretEncrypted: encryptSigningSecret(signingSecret),
        eventTypes: [...MERCHANT_WEBHOOK_EVENTS],
        maxAttempts: parsed.data.maxAttempts,
        enabled: parsed.data.enabled,
      })
      .onConflictDoNothing({ target: merchantWebhookConfigs.merchantId })
      .returning({
        url: merchantWebhookConfigs.url,
        eventTypes: merchantWebhookConfigs.eventTypes,
        maxAttempts: merchantWebhookConfigs.maxAttempts,
        enabled: merchantWebhookConfigs.enabled,
      });
    if (!config) throw new AppError('CONFLICT', 'Webhook configuration already exists.', 409);
    await recordMerchantEvent(tx, merchantId, 'webhook.create', admin, audit);
    return config;
  });
  return { config: result, signingSecret };
}

export async function updateMerchantWebhook(
  merchantId: string,
  rawInput: unknown,
  admin: AdminIdentity,
  audit: AdminWriteAudit,
) {
  assertUuid(merchantId);
  const parsed = webhookInput.safeParse(rawInput);
  if (!parsed.success) {
    throw new AppError('VALIDATION_FAILED', parsed.error.issues[0]?.message ?? 'Invalid webhook settings.', 422);
  }
  const url = normalizeMerchantWebhookUrl(parsed.data.url);
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(merchantWebhookConfigs)
      .set({
        url,
        maxAttempts: parsed.data.maxAttempts,
        enabled: parsed.data.enabled,
        updatedAt: new Date(),
      })
      .where(eq(merchantWebhookConfigs.merchantId, merchantId))
      .returning({
        url: merchantWebhookConfigs.url,
        eventTypes: merchantWebhookConfigs.eventTypes,
        maxAttempts: merchantWebhookConfigs.maxAttempts,
        enabled: merchantWebhookConfigs.enabled,
      });
    if (!updated) throw new AppError('NOT_FOUND', 'Webhook configuration not found.', 404);
    await recordMerchantEvent(tx, merchantId, 'webhook.update', admin, audit);
    return updated;
  });
}

export async function rotateMerchantWebhookSecret(
  merchantId: string,
  admin: AdminIdentity,
  audit: AdminWriteAudit,
) {
  assertUuid(merchantId);
  const signingSecret = newSigningSecret();
  await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(merchantWebhookConfigs)
      .set({ signingSecretEncrypted: encryptSigningSecret(signingSecret), updatedAt: new Date() })
      .where(eq(merchantWebhookConfigs.merchantId, merchantId))
      .returning({ id: merchantWebhookConfigs.id });
    if (!updated) throw new AppError('NOT_FOUND', 'Webhook configuration not found.', 404);
    await recordMerchantEvent(tx, merchantId, 'webhook.secret.rotate', admin, audit);
  });
  return { signingSecret };
}

export async function redeliverMerchantWebhook(
  merchantId: string,
  deliveryId: string,
  admin: AdminIdentity,
  audit: AdminWriteAudit,
) {
  assertUuid(merchantId);
  assertUuid(deliveryId);
  return db.transaction(async (tx) => {
    const [delivery] = await tx
      .select()
      .from(merchantWebhookDeliveries)
      .where(and(eq(merchantWebhookDeliveries.id, deliveryId), eq(merchantWebhookDeliveries.merchantId, merchantId)))
      .for('update')
      .limit(1);
    if (!delivery) throw new AppError('NOT_FOUND', 'Webhook delivery not found.', 404);
    if (delivery.status !== 'failed') {
      throw new AppError('CONFLICT', 'Only failed webhook deliveries can be redelivered.', 409);
    }

    await tx
      .update(merchantWebhookDeliveries)
      .set({
        status: 'pending',
        attempts: 0,
        nextAttemptAt: new Date(),
        lockedUntil: null,
        lastError: null,
        lastStatusCode: null,
        deliveredAt: null,
      })
      .where(eq(merchantWebhookDeliveries.id, deliveryId));
    await recordMerchantEvent(tx, merchantId, 'webhook.redeliver', admin, audit);
    return { deliveryId, status: 'pending' as const };
  });
}

export async function getMerchantOnboarding(merchantId: string) {
  assertUuid(merchantId);
  const [row] = await db
    .select({
      checklist: merchantOnboarding.checklist,
      dueDiligenceNotes: merchantOnboarding.dueDiligenceNotes,
      updatedBy: merchantOnboarding.updatedBy,
      updatedAt: merchantOnboarding.updatedAt,
    })
    .from(merchantOnboarding)
    .where(eq(merchantOnboarding.merchantId, merchantId))
    .limit(1);
  return row ?? {
    checklist: DEFAULT_CHECKLIST,
    dueDiligenceNotes: '',
    updatedBy: null,
    updatedAt: null,
  };
}

export async function updateMerchantOnboarding(
  merchantId: string,
  rawInput: unknown,
  admin: AdminIdentity,
  audit: AdminWriteAudit,
) {
  assertUuid(merchantId);
  const parsed = onboardingInput.safeParse(rawInput);
  if (!parsed.success) {
    throw new AppError('VALIDATION_FAILED', parsed.error.issues[0]?.message ?? 'Invalid onboarding details.', 422);
  }

  return db.transaction(async (tx) => {
    const [merchant] = await tx.select({ id: merchants.id }).from(merchants).where(eq(merchants.id, merchantId)).limit(1);
    if (!merchant) throw new AppError('NOT_FOUND', 'Merchant not found.', 404);
    const [row] = await tx
      .insert(merchantOnboarding)
      .values({
        merchantId,
        checklist: parsed.data.checklist,
        dueDiligenceNotes: parsed.data.dueDiligenceNotes.trim(),
        updatedBy: admin.actorId,
      })
      .onConflictDoUpdate({
        target: merchantOnboarding.merchantId,
        set: {
          checklist: parsed.data.checklist,
          dueDiligenceNotes: parsed.data.dueDiligenceNotes.trim(),
          updatedBy: admin.actorId,
          updatedAt: new Date(),
        },
      })
      .returning({
        checklist: merchantOnboarding.checklist,
        dueDiligenceNotes: merchantOnboarding.dueDiligenceNotes,
        updatedBy: merchantOnboarding.updatedBy,
        updatedAt: merchantOnboarding.updatedAt,
      });
    if (!row) throw new AppError('INTERNAL', 'Could not save onboarding details.');
    await recordMerchantEvent(tx, merchantId, 'onboarding.update', admin, audit);
    return row;
  });
}

export async function enqueueExpiredCheckoutEvents(limit = 100) {
  const now = new Date();
  const activeAttempt = db
    .select({ id: checkoutAttempts.id })
    .from(checkoutAttempts)
    .where(
      and(
        eq(checkoutAttempts.sessionId, checkoutSessions.id),
        inArray(checkoutAttempts.status, ['pending', 'unknown']),
      ),
    );
  const alreadyEnqueued = db
    .select({ id: merchantWebhookDeliveries.id })
    .from(merchantWebhookDeliveries)
    .where(
      and(
        eq(merchantWebhookDeliveries.merchantId, merchants.id),
        sql`${merchantWebhookDeliveries.eventKey} = ('checkout.expired:' || ${checkoutSessions.id})`,
      ),
    );
  const rows = await db
    .select({
      session: checkoutSessions,
      merchantId: merchants.id,
      merchantName: merchants.name,
      configEvents: merchantWebhookConfigs.eventTypes,
    })
    .from(checkoutSessions)
    .innerJoin(merchants, eq(merchants.id, checkoutSessions.merchantId))
    .innerJoin(merchantWebhookConfigs, eq(merchantWebhookConfigs.merchantId, merchants.id))
    .where(
      and(
        eq(checkoutSessions.status, 'open'),
        eq(merchantWebhookConfigs.enabled, true),
        lt(checkoutSessions.expiresAt, now),
        notExists(activeAttempt),
        notExists(alreadyEnqueued),
      ),
    )
    .orderBy(asc(checkoutSessions.expiresAt))
    .limit(limit * 4);

  let enqueued = 0;
  for (const row of rows) {
    if (!row.configEvents.includes('checkout.expired')) continue;
    await db.transaction(async (tx) => {
      await enqueueMerchantWebhook(tx, {
        merchantId: row.merchantId,
        eventType: 'checkout.expired',
        eventKey: `checkout.expired:${row.session.id}`,
        payload: {
          id: `checkout.expired:${row.session.id}`,
          type: 'checkout.expired',
          createdAt: now.toISOString(),
          data: {
            merchantId: row.merchantId,
            merchantName: row.merchantName,
            checkoutReference: row.session.reference,
            merchantReference: row.session.merchantReference,
            amount: row.session.amount.toString(),
            currency: row.session.currency,
            expiredAt: row.session.expiresAt.toISOString(),
          },
        },
      });
    });
    enqueued += 1;
  }
  return enqueued;
}

export { DEFAULT_ATTEMPTS, webhookInput as merchantWebhookInput };
