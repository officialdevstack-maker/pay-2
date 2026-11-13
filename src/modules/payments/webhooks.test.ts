import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/server/db/client';
import { MOCK_SIGNATURE_HEADER, signMockWebhook } from '@/server/providers/mock';
import { ingestWebhook, registerHandler } from './index';

const hasTestDatabase =
  process.env.LEDGER_TEST_DATABASE_URL && process.env.LEDGER_TEST_DATABASE_URL === process.env.DATABASE_URL;
const integration = hasTestDatabase ? describe : describe.skip;

integration('webhook ingestion', () => {
  afterAll(async () => {
    await db.$client.end();
  });

  it('handles an event once, however many times it is delivered', async () => {
    let calls = 0;
    registerHandler('funding.received', async () => {
      calls += 1;
    });

    const body = JSON.stringify({
      id: `evt_${randomUUID()}`,
      type: 'funding.received',
      accountNumber: '9900000001',
      amountKobo: '1000',
    });
    const headers = new Headers({ [MOCK_SIGNATURE_HEADER]: signMockWebhook(body) });

    await Promise.all(Array.from({ length: 5 }, () => ingestWebhook(body, headers)));
    expect(calls).toBe(1);
  });

  it('rejects a bad signature', async () => {
    await expect(ingestWebhook('{}', new Headers())).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
