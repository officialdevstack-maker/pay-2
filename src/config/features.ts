/**
 * Flip to true only when approved tokenized card entry exists and /payment-methods/add ships.
 * Until then the "Add payment method" action is hidden, not disabled.
 */
export const FEATURES = {
  cardTokenization: false,
} as const;
