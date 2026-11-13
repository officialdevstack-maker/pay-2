export const RATE_RULES = {
  p2p_send: { limit: 10, windowSeconds: 60 },
  p2p_send_ip: { limit: 30, windowSeconds: 60 },
  recipient_lookup: { limit: 30, windowSeconds: 60 },
  recipient_lookup_ip: { limit: 90, windowSeconds: 60 },
  pin_verify: { limit: 10, windowSeconds: 60 },
} as const;
