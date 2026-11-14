import 'server-only';
import { createHmac } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { env } from '@/env';
import { normalizeEmail, normalizePhone } from '@/lib/contact';
import { db } from '@/server/db/client';
import { payUsers } from '@/server/db/schema';

export const contactHash = (kind: 'email' | 'phone', value: string): string =>
  createHmac('sha256', env.CONTACT_PEPPER ?? env.SESSION_SECRET).update(`${kind}\0${value}`).digest('hex');

interface ContactClaims {
  email?: unknown;
  email_verified?: unknown;
  phone_number?: unknown;
  phone_number_verified?: unknown;
}

/**
 * Called at every sign-in. Only VERIFIED contacts are indexed, otherwise someone could sign up with a
 * victim's address and receive their payments. Anything unverified or missing clears the stored value.
 */
export async function syncContacts(userId: string, claims: ContactClaims): Promise<void> {
  const email =
    claims.email_verified === true && typeof claims.email === 'string' ? normalizeEmail(claims.email) : null;
  const phone =
    claims.phone_number_verified === true && typeof claims.phone_number === 'string'
      ? normalizePhone(claims.phone_number)
      : null;

  await db
    .update(payUsers)
    .set({
      email,
      emailHash: email ? contactHash('email', email) : null,
      phoneHash: phone ? contactHash('phone', phone) : null,
    })
    .where(eq(payUsers.id, userId));
}
