import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/server/db/client';
import { merchantEvents } from '@/server/db/schema';
import type { AdminIdentity } from '@/modules/admin/identity';
import type { AdminWriteAudit } from '@/modules/admin/internal-route';
import { findMerchantByClient } from '@/modules/checkout/create';
import { createMerchant, createMerchantInput, transitionMerchant } from './index';

const hasTestDatabase =
  process.env.LEDGER_TEST_DATABASE_URL && process.env.LEDGER_TEST_DATABASE_URL === process.env.DATABASE_URL;
const integration = hasTestDatabase ? describe : describe.skip;

integration('merchant lifecycle', () => {
  afterAll(async () => {
    await db.$client.end();
  });

  const admin = (actorId: number): AdminIdentity => ({
    sub: String(actorId),
    actorId,
    email: `admin-${actorId}@example.test`,
    name: `Admin ${actorId}`,
    role: 'operator',
    permissions: ['pay.write', 'pay.approve'],
    authTime: Math.floor(Date.now() / 1000),
    issuedAt: Math.floor(Date.now() / 1000),
    expiresAt: Math.floor(Date.now() / 1000) + 60,
    ip: '127.0.0.1',
    jti: randomUUID(),
  });

  const audit = (requestId = randomUUID()): AdminWriteAudit => ({
    reason: 'Merchant onboarding test',
    requestId,
    actorIp: '127.0.0.1',
  });

  async function create(clientId = `merchant-${randomUUID()}`) {
    const input = createMerchantInput.parse({
      name: 'Test Merchant',
      clientId,
      returnUrl: 'https://merchant.example.test/return',
    });
    return createMerchant(input, admin(10), audit());
  }

  it('creates a pending merchant and writes its creation event', async () => {
    const merchant = await create();
    expect(merchant.status).toBe('pending');
    expect(merchant.returnUrl).toBe('https://merchant.example.test/return');
    await expect(findMerchantByClient(merchant.clientId)).rejects.toMatchObject({
      code: 'MERCHANT_UNAVAILABLE',
    });

    const events = await db.select().from(merchantEvents).where(eq(merchantEvents.merchantId, merchant.id));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      action: 'create',
      fromStatus: null,
      toStatus: 'pending',
      actorId: 10,
    });
  });

  it('requires a different admin to approve, then permits valid lifecycle transitions', async () => {
    const merchant = await create();
    await expect(transitionMerchant(merchant.id, 'approve', admin(10), audit())).rejects.toMatchObject({
      code: 'APPROVER_MUST_DIFFER',
      status: 403,
    });

    const approved = await transitionMerchant(merchant.id, 'approve', admin(11), audit());
    expect(approved.merchant.status).toBe('active');
    expect(approved.merchant.approvedAt).toBeInstanceOf(Date);

    const suspended = await transitionMerchant(merchant.id, 'suspend', admin(10), audit());
    expect(suspended.merchant.status).toBe('suspended');
    const reactivated = await transitionMerchant(merchant.id, 'reactivate', admin(11), audit());
    expect(reactivated.merchant.status).toBe('active');

    await expect(transitionMerchant(merchant.id, 'approve', admin(11), audit())).rejects.toMatchObject({
      code: 'CONFLICT',
      status: 409,
    });
  });

  it('rejects a duplicate client ID', async () => {
    const clientId = `merchant-${randomUUID()}`;
    await create(clientId);
    await expect(create(clientId)).rejects.toMatchObject({ code: 'CONFLICT', status: 409 });
  });
});
