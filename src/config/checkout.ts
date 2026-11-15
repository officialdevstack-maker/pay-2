export const CHECKOUT = {
  /** How long a session stays payable after creation. */
  sessionTtlSeconds: 30 * 60,
  maxAmountKobo: 5_000_000_000n,
} as const;
