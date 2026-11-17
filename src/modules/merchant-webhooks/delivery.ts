import 'server-only';
import { createHmac } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { isIP } from 'node:net';
import { request as httpsRequest } from 'node:https';
import { checkServerIdentity } from 'node:tls';
import { and, asc, eq, inArray, lte, max, or } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { db } from '@/server/db/client';
import {
  merchantWebhookAttempts,
  merchantWebhookConfigs,
  merchantWebhookDeliveries,
} from '@/server/db/schema';
import { resolveWebhookDestination } from './index';
import { decryptSigningSecret } from './crypto';

const RETRY_DELAYS_MS = [60_000, 300_000, 1_800_000, 7_200_000, 21_600_000, 86_400_000, 86_400_000];
const DELIVERY_TIMEOUT_MS = 10_000;

type ClaimedDelivery = {
  id: string;
  merchantId: string;
  eventType: string;
  payload: Record<string, unknown>;
  attempts: number;
  attemptId: string;
  url: string;
  signingSecretEncrypted: string;
  maxAttempts: number;
};

async function postWebhook(claimed: ClaimedDelivery, body: string, timestamp: string, signature: string) {
  const url = new URL(claimed.url);
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const destination = await resolveWebhookDestination(claimed.url);
  const options = {
    protocol: url.protocol,
    hostname: destination.address,
    port: url.port || undefined,
    path: `${url.pathname}${url.search}`,
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      'User-Agent': 'Spurs-Pay-Webhooks/1.0',
      'Spurs-Event': claimed.eventType,
      'Spurs-Delivery': claimed.id,
      'Spurs-Signature': `t=${timestamp},v1=${signature}`,
      Host: url.host,
    },
  };
  return new Promise<number>((resolve, reject) => {
    const handleResponse = (response: import('node:http').IncomingMessage) => {
      response.resume();
      response.on('end', () => resolve(response.statusCode ?? 0));
    };
    const request =
      url.protocol === 'https:'
        ? httpsRequest(
            {
              ...options,
              servername: isIP(hostname) ? undefined : hostname,
              checkServerIdentity: (_hostname, certificate) =>
                checkServerIdentity(hostname, certificate),
            },
            handleResponse,
          )
        : httpRequest(options, handleResponse);
    request.setTimeout(DELIVERY_TIMEOUT_MS, () => request.destroy(new Error('Request timed out.')));
    request.on('error', reject);
    request.end(body);
  });
}

async function claimDelivery(): Promise<ClaimedDelivery | null> {
  const now = new Date();
  return db.transaction(async (tx) => {
    const [delivery] = await tx
      .select()
      .from(merchantWebhookDeliveries)
      .innerJoin(merchantWebhookConfigs, eq(merchantWebhookConfigs.merchantId, merchantWebhookDeliveries.merchantId))
      .where(
        and(
          eq(merchantWebhookConfigs.enabled, true),
          lte(merchantWebhookDeliveries.nextAttemptAt, now),
          or(
            eq(merchantWebhookDeliveries.status, 'pending'),
            and(
              eq(merchantWebhookDeliveries.status, 'sending'),
              lte(merchantWebhookDeliveries.lockedUntil, now),
            ),
          ),
        ),
      )
      .orderBy(asc(merchantWebhookDeliveries.nextAttemptAt))
      .for('update', { skipLocked: true })
      .limit(1);
    if (!delivery) return null;

    const attemptNumber = delivery.merchant_webhook_deliveries.attempts + 1;
    const [history] = await tx
      .select({ attemptNumber: max(merchantWebhookAttempts.attemptNumber) })
      .from(merchantWebhookAttempts)
      .where(eq(merchantWebhookAttempts.deliveryId, delivery.merchant_webhook_deliveries.id));
    const historyAttemptNumber = (history?.attemptNumber ?? 0) + 1;
    if (delivery.merchant_webhook_deliveries.status === 'sending') {
      await tx
        .update(merchantWebhookAttempts)
        .set({
          status: 'failed',
          error: 'Delivery worker lease expired.',
          completedAt: now,
        })
        .where(
          and(
            eq(merchantWebhookAttempts.deliveryId, delivery.merchant_webhook_deliveries.id),
            eq(merchantWebhookAttempts.status, 'pending'),
          ),
        );
    }

    const [updated] = await tx
      .update(merchantWebhookDeliveries)
      .set({
        status: 'sending',
        attempts: attemptNumber,
        lastAttemptAt: now,
        lockedUntil: new Date(now.getTime() + DELIVERY_TIMEOUT_MS + 5_000),
      })
      .where(eq(merchantWebhookDeliveries.id, delivery.merchant_webhook_deliveries.id))
      .returning({ id: merchantWebhookDeliveries.id });
    if (!updated) return null;
    const [attempt] = await tx
      .insert(merchantWebhookAttempts)
      .values({ deliveryId: updated.id, attemptNumber: historyAttemptNumber })
      .returning({ id: merchantWebhookAttempts.id });
    if (!attempt) throw new Error('Could not record merchant webhook attempt.');

    return {
      id: updated.id,
      merchantId: delivery.merchant_webhook_deliveries.merchantId,
      eventType: delivery.merchant_webhook_deliveries.eventType,
      payload: delivery.merchant_webhook_deliveries.payload,
      attempts: attemptNumber,
      attemptId: attempt.id,
      url: delivery.merchant_webhook_configs.url,
      signingSecretEncrypted: delivery.merchant_webhook_configs.signingSecretEncrypted,
      maxAttempts: delivery.merchant_webhook_configs.maxAttempts,
    };
  });
}

async function deliver(claimed: ClaimedDelivery) {
  let responseStatus: number | null = null;
  let error: string | null = null;
  const now = new Date();
  try {
    const body = JSON.stringify(claimed.payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createHmac('sha256', decryptSigningSecret(claimed.signingSecretEncrypted))
      .update(`${timestamp}.${body}`)
      .digest('hex');
    responseStatus = await postWebhook(claimed, body, timestamp, signature);
    if (responseStatus < 200 || responseStatus >= 300) error = `HTTP ${responseStatus}`;
  } catch (cause) {
    error =
      cause instanceof Error && cause.message.includes('timed out')
        ? 'Request timed out.'
        : cause instanceof Error && cause.message.includes('non-public address')
          ? 'Webhook host resolves to a non-public address.'
          : 'Request failed.';
  }

  const delivered = responseStatus !== null && responseStatus >= 200 && responseStatus < 300;
  const finalStatus = delivered ? 'delivered' : claimed.attempts >= claimed.maxAttempts ? 'failed' : 'pending';
  const retryDelay = RETRY_DELAYS_MS[Math.min(claimed.attempts - 1, RETRY_DELAYS_MS.length - 1)]!;
  await db.transaction(async (tx) => {
    await tx
      .update(merchantWebhookAttempts)
      .set({
        status: delivered ? 'delivered' : 'failed',
        responseStatus,
        error,
        completedAt: now,
      })
      .where(eq(merchantWebhookAttempts.id, claimed.attemptId));
    await tx
      .update(merchantWebhookDeliveries)
      .set({
        status: finalStatus,
        nextAttemptAt: delivered ? now : new Date(now.getTime() + retryDelay),
        lockedUntil: null,
        lastStatusCode: responseStatus,
        lastError: error,
        deliveredAt: delivered ? now : null,
      })
      .where(eq(merchantWebhookDeliveries.id, claimed.id));
  });
  if (!delivered) {
    logger.warn('merchant webhook delivery failed', {
      deliveryId: claimed.id,
      eventType: claimed.eventType,
      attempt: claimed.attempts,
      responseStatus,
      error,
    });
  }
  return delivered;
}

export async function deliverMerchantWebhooks(limit = 50) {
  let attempted = 0;
  let delivered = 0;
  while (attempted < limit) {
    const claimed = await claimDelivery();
    if (!claimed) break;
    attempted += 1;
    if (await deliver(claimed)) delivered += 1;
  }
  return { attempted, delivered };
}
