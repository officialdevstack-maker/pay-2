import { randomBytes } from 'node:crypto';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32, no I L O U

/** Our own reference format. Never reuse a provider's format. */
export function newReference(prefix = 'SPY'): string {
  let out = '';
  for (const byte of randomBytes(16)) out += ALPHABET.charAt(byte % 32); // 256 % 32 === 0, so no bias
  return `${prefix}_${out}`;
}
