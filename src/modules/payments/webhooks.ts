import 'server-only';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { db } from '@/server/db/client';
import { webhookEvents } from '@/server/db/schema';
import { getProvider, type ProviderEvent } from '@/server/providers';
import { getHandler } from './handlers';

/**
 * Verify, store (deduped by provider event id), then process.
 * A failed handler never fails the HTTP response; the sweep retries it.
 */
export async function ingestWebhook(rawBody: string, headers: Headers): Promise<void> {
  const provider = await getProvider();
  if (!provider.verifyWebhook(rawBody, headers)) {
    throw new AppError('FORBIDDEN', 'Request not allowed.', 403);
  }

  const event = provider.parseWebhook(rawBody);
  if (!event) return;

  const [row] = await db
    .insert(webhookEvents)
    .values({ driver: provider.driver, eventId: event.eventId, type: event.type, rawBody })
    .onConflictDoNothing()
    .returning({ id: webhookEvents.id });

  if (!row) return;

  await processEvent(row.id, event);
}

export async function processEvent(id: string, parsed?: ProviderEvent): Promise<'processed' | 'skipped' | 'failed'> {
  try {
    return await db.transaction(async (tx) => {
      const claimed = await tx.execute(sql`
        select id, type, raw_body as "rawBody" from webhook_events
        where id = ${id} and status in ('received', 'failed')
        for update skip locked
      `);
      const row = claimed.rows[0] as { id: string; type: string; rawBody: string } | undefined;
      if (!row) return 'skipped';

      const event = parsed ?? (await getProvider()).parseWebhook(row.rawBody);
      if (!event) {
        await tx
          .update(webhookEvents)
          .set({ status: 'processed', processedAt: new Date(), lastError: 'unparseable' })
          .where(eq(webhookEvents.id, id));
        return 'processed';
      }

      const handler = getHandler(event.type);
      if (!handler) {
        logger.warn('no handler for webhook event, leaving pending', { type: event.type, id });
        return 'skipped';
      }

      await handler(event, tx);
      await tx
        .update(webhookEvents)
        .set({ status: 'processed', processedAt: new Date(), attempts: sql`${webhookEvents.attempts} + 1` })
        .where(eq(webhookEvents.id, id));
      return 'processed';
    });
  } catch (error) {
    logger.error('webhook event failed', { id, error });
    await db
      .update(webhookEvents)
      .set({
        status: 'failed',
        attempts: sql`${webhookEvents.attempts} + 1`,
        lastError: error instanceof Error ? error.message.slice(0, 500) : 'unknown',
      })
      .where(and(eq(webhookEvents.id, id), inArray(webhookEvents.status, ['received', 'failed'])));
    return 'failed';
  }
}

/** For the Phase 13 job runner or a cron route: retry anything stuck. */
export async function processPendingEvents(limit = 50): Promise<number> {
  const pending = await db
    .select({ id: webhookEvents.id })
    .from(webhookEvents)
    .where(inArray(webhookEvents.status, ['received', 'failed']))
    .orderBy(asc(webhookEvents.receivedAt))
    .limit(limit);
  let done = 0;
  for (const { id } of pending) {
    if ((await processEvent(id)) === 'processed') done++;
  }
  return done;
}
