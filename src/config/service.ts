/** Products a service client may act as. 'pay' is deliberately absent: only Pay's own app acts as Pay. */
export const SERVICE_PRODUCTS = ['wallet'] as const;
export type ServiceProduct = (typeof SERVICE_PRODUCTS)[number];

export const SERVICE_API = {
  /** Scope an Accounts-issued token must carry. Grant it to service clients only, never to end-user clients. */
  requiredScope: 'pay:service',
  /** How long an "active" introspection answer is trusted. Bounds revocation lag. */
  introspectionCacheSeconds: 30,
  maxCacheEntries: 1_000,
  httpTimeoutMs: 10_000,
  activityPageSize: { default: 20, max: 50 },
} as const;
