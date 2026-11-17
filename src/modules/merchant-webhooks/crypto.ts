import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { env } from '@/env';

const key = scryptSync(env.SESSION_SECRET, 'spurs-pay-merchant-webhook-v1', 32);

export function newSigningSecret() {
  return randomBytes(32).toString('base64url');
}

export function encryptSigningSecret(secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString('base64url')).join('.');
}

export function decryptSigningSecret(value: string) {
  const [encodedIv, encodedTag, encodedCiphertext, extra] = value.split('.');
  if (!encodedIv || !encodedTag || !encodedCiphertext || extra !== undefined) {
    throw new Error('Stored webhook signing secret is malformed.');
  }
  const iv = Buffer.from(encodedIv, 'base64url');
  const tag = Buffer.from(encodedTag, 'base64url');
  const ciphertext = Buffer.from(encodedCiphertext, 'base64url');
  if (iv.length !== 12 || tag.length !== 16 || ciphertext.length === 0) {
    throw new Error('Stored webhook signing secret is malformed.');
  }

  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    throw new Error('Stored webhook signing secret is invalid or tampered.');
  }
}
