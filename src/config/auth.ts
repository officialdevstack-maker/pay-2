export const AUTH = {
  /** Absolute session lifetime when a refresh token exists. */
  sessionTtlSeconds: 60 * 60 * 24 * 30,
  /** The login round trip must finish within this window. */
  authRequestTtlSeconds: 10 * 60,
  /** Refresh the access token this long before it expires. */
  tokenRefreshSkewSeconds: 60,
  /** Sensitive actions need a login at least this recent. */
  stepUpMaxAgeSeconds: 300,
  /** How long a "not suspended" answer from Accounts is trusted. */
  statusCacheSeconds: 45,
  httpTimeoutMs: 10_000,
} as const;
