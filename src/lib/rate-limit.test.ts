import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { rateLimit } from './rate-limit';
import { db } from '@/server/db/client';

const hasTestDatabase =
  process.env.LEDGER_TEST_DATABASE_URL && process.env.LEDGER_TEST_DATABASE_URL === process.env.DATABASE_URL;
const integration = hasTestDatabase ? describe : describe.skip;

integration('rate limits', () => {
  afterAll(async () => {
    await db.$client.end();
  });

  it('blocks requests after the configured window allowance', async () => {
    const identity = randomUUID();
    for (let attempt = 0; attempt < 30; attempt++) {
      await rateLimit('recipient_lookup', identity);
    }
    await expect(rateLimit('recipient_lookup', identity)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      status: 429,
    });
  });
});
