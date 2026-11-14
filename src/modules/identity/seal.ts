import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { env } from '@/env';

let key: Buffer | undefined;

const encryptionKey = () => (key ??= scryptSync(env.SESSION_SECRET, 'spurs-pay-auth-v1', 32));

export function encrypt(value: unknown): string {
  for (;;) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    const sealed = [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString('base64url')).join('.');
    if (!sealed.endsWith('x')) return sealed;
  }
}

export function decrypt<T>(value: string): T {
  const [encodedIv, encodedTag, encodedCiphertext, extra] = value.split('.');
  if (!encodedIv || !encodedTag || !encodedCiphertext || extra !== undefined) {
    throw new Error('Sealed value is malformed.');
  }

  try {
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(encodedIv, 'base64url'));
    decipher.setAuthTag(Buffer.from(encodedTag, 'base64url'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(encodedCiphertext, 'base64url')),
      decipher.final(),
    ]);
    return JSON.parse(plaintext.toString('utf8')) as T;
  } catch {
    throw new Error('Sealed value is malformed or tampered.');
  }
}
