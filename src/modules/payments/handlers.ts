import 'server-only';
import type { Tx } from '@/server/db/client';
import type { ProviderEvent, ProviderEventType } from '@/server/providers';

export type EventHandler<T extends ProviderEventType> = (
  event: Extract<ProviderEvent, { type: T }>,
  tx: Tx,
) => Promise<void>;

type Registry = Partial<Record<ProviderEventType, (...args: unknown[]) => Promise<void>>>;
const registry: Registry = {};

/**
 * Phase 5 registers funding.received, Phase 10 registers payout.*.
 * Handlers run inside the same DB transaction that marks the event processed,
 * and must post to the ledger with the event id as the idempotency key.
 */
export function registerHandler<T extends ProviderEventType>(type: T, handler: EventHandler<T>) {
  registry[type] = handler as (...args: unknown[]) => Promise<void>;
}

export function getHandler(type: ProviderEventType) {
  return registry[type] as EventHandler<typeof type> | undefined;
}
