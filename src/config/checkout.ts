export const CHECKOUT = {
  /** Placeholder: confirm the bank-transfer lifetime before launch. */
  sessionTtlSeconds: 60 * 60,
  /**
   * How long after expiry an unpaid bank-transfer attempt stays open, so a late
   * transfer can still settle. Must be at least the provider account's validity.
   * Placeholder: confirm in the sandbox.
   */
  attemptGraceSeconds: 24 * 60 * 60,
  maxAmountKobo: 5_000_000_000n,
} as const;
