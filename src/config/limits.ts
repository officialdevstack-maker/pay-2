export const WALLET_LIMITS = {
  pay: {
    /** Placeholder limits; replace after KYC tiers and policy are approved. */
    perTransferKobo: 5_000_000n,
    dailyDebitKobo: 20_000_000n,
    maxBalanceKobo: 50_000_000n,
  },
  wallet: {
    perTransferKobo: 5_000_000n,
    dailyDebitKobo: 20_000_000n,
    maxBalanceKobo: 50_000_000n,
  },
} as const;

export const PIN_POLICY = {
  minLength: 4,
  maxLength: 6,
  maxFailedAttempts: 5,
  lockoutSeconds: 15 * 60,
} as const;
