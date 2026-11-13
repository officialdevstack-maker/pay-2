import 'server-only';
import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { PIN_POLICY } from '@/config/limits';
import { env } from '@/env';
import { AppError } from '@/lib/errors';
import { rateLimit } from '@/lib/rate-limit';
import { db, type Tx } from '@/server/db/client';
import { walletPins } from '@/server/db/schema';
import type { Product } from './types';

const KEY_LENGTH = 32;
const SCRYPT_OPTIONS = { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

type PinRow = typeof walletPins.$inferSelect;
type PinAttempt = { kind: 'ok' } | { kind: 'invalid' } | { kind: 'locked'; retryAfterSeconds: number };

function assertPin(pin: string): void {
  if (!new RegExp(`^\\d{${PIN_POLICY.minLength},${PIN_POLICY.maxLength}}$`).test(pin)) {
    throw new AppError(
      'VALIDATION_FAILED',
      `Enter a ${PIN_POLICY.minLength} to ${PIN_POLICY.maxLength} digit PIN.`,
      422,
    );
  }
}

function pinMaterial(pin: string): Buffer {
  return createHmac('sha256', env.PIN_PEPPER ?? env.SESSION_SECRET).update(pin, 'utf8').digest();
}

function deriveHash(pin: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(pinMaterial(pin), salt, KEY_LENGTH, SCRYPT_OPTIONS, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

async function findPin(tx: Tx, userId: string, product: Product): Promise<PinRow | undefined> {
  const [row] = await tx
    .select()
    .from(walletPins)
    .where(and(eq(walletPins.userId, userId), eq(walletPins.product, product)))
    .for('update')
    .limit(1);
  return row;
}

async function checkPin(tx: Tx, row: PinRow, pin: string): Promise<PinAttempt> {
  const now = new Date();
  if (row.lockedUntil && row.lockedUntil > now) {
    return {
      kind: 'locked',
      retryAfterSeconds: Math.max(1, Math.ceil((row.lockedUntil.getTime() - now.getTime()) / 1000)),
    };
  }

  if (!/^[a-f0-9]{32}$/.test(row.salt) || !/^[a-f0-9]{64}$/.test(row.hash)) {
    throw new AppError('INTERNAL', 'Stored PIN data is invalid.');
  }

  const actual = await deriveHash(pin, Buffer.from(row.salt, 'hex'));
  const expected = Buffer.from(row.hash, 'hex');
  if (timingSafeEqual(actual, expected)) {
    await tx
      .update(walletPins)
      .set({ failedAttempts: 0, lockedUntil: null, updatedAt: now })
      .where(and(eq(walletPins.userId, row.userId), eq(walletPins.product, row.product)));
    return { kind: 'ok' };
  }

  const previousAttempts =
    row.lockedUntil && row.lockedUntil <= now ? 0 : row.failedAttempts;
  const failedAttempts = previousAttempts + 1;
  const locked = failedAttempts >= PIN_POLICY.maxFailedAttempts;
  const lockedUntil = locked ? new Date(now.getTime() + PIN_POLICY.lockoutSeconds * 1000) : null;
  await tx
    .update(walletPins)
    .set({ failedAttempts, lockedUntil, updatedAt: now })
    .where(and(eq(walletPins.userId, row.userId), eq(walletPins.product, row.product)));

  return locked
    ? { kind: 'locked', retryAfterSeconds: PIN_POLICY.lockoutSeconds }
    : { kind: 'invalid' };
}

function throwPinAttempt(attempt: PinAttempt): void {
  if (attempt.kind === 'invalid') throw new AppError('PIN_INVALID', 'The PIN is incorrect.', 422);
  if (attempt.kind === 'locked') {
    throw new AppError('PIN_LOCKED', 'PIN attempts are temporarily locked. Try again later.', 429, {
      retryAfterSeconds: attempt.retryAfterSeconds,
    });
  }
}

async function recordAttempt(userId: string, product: Product, pin: string): Promise<PinAttempt> {
  assertPin(pin);
  return db.transaction(async (tx) => {
    const row = await findPin(tx, userId, product);
    if (!row) throw new AppError('PIN_NOT_SET', 'Set a transaction PIN before sending money.', 409);
    return checkPin(tx, row, pin);
  });
}

export async function setPin(userId: string, product: Product, pin: string): Promise<void> {
  assertPin(pin);
  const salt = randomBytes(16);
  const hash = await deriveHash(pin, salt);
  try {
    await db.insert(walletPins).values({
      userId,
      product,
      salt: salt.toString('hex'),
      hash: hash.toString('hex'),
    });
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === '23505'
    ) {
      throw new AppError('PIN_ALREADY_SET', 'Your transaction PIN is already set.', 409);
    }
    throw error;
  }
}

export async function changePin(
  userId: string,
  product: Product,
  currentPin: string,
  newPin: string,
): Promise<void> {
  assertPin(currentPin);
  assertPin(newPin);
  if (currentPin === newPin) {
    throw new AppError('VALIDATION_FAILED', 'Choose a different PIN.', 422);
  }

  const salt = randomBytes(16);
  const hash = await deriveHash(newPin, salt);
  const attempt = await db.transaction(async (tx) => {
    const row = await findPin(tx, userId, product);
    if (!row) throw new AppError('PIN_NOT_SET', 'Set a transaction PIN first.', 409);
    const result = await checkPin(tx, row, currentPin);
    if (result.kind !== 'ok') return result;

    await tx
      .update(walletPins)
      .set({
        salt: salt.toString('hex'),
        hash: hash.toString('hex'),
        failedAttempts: 0,
        lockedUntil: null,
        updatedAt: new Date(),
      })
      .where(and(eq(walletPins.userId, userId), eq(walletPins.product, product)));
    return result;
  });
  throwPinAttempt(attempt);
}

export async function verifyPin(userId: string, product: Product, pin: string): Promise<void> {
  await rateLimit('pin_verify', userId);
  const attempt = await recordAttempt(userId, product, pin);
  throwPinAttempt(attempt);
}
