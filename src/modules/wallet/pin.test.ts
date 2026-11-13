import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/server/db/client';
import { payUsers } from '@/server/db/schema';
import { changePin, setPin, verifyPin } from './pin';

const hasTestDatabase =
  process.env.LEDGER_TEST_DATABASE_URL && process.env.LEDGER_TEST_DATABASE_URL === process.env.DATABASE_URL;
const integration = hasTestDatabase ? describe : describe.skip;

integration('wallet PINs', () => {
  afterAll(async () => {
    await db.$client.end();
  });

  async function userId() {
    const [user] = await db
      .insert(payUsers)
      .values({ accountsSub: `pin-test-${randomUUID()}` })
      .returning({ id: payUsers.id });
    if (!user) throw new Error('Test user could not be created.');
    return user.id;
  }

  it('sets and changes a product-scoped PIN', async () => {
    const id = await userId();
    await setPin(id, 'pay', '1234');
    await expect(verifyPin(id, 'pay', '1234')).resolves.toBeUndefined();
    await expect(verifyPin(id, 'wallet', '1234')).rejects.toMatchObject({ code: 'PIN_NOT_SET' });

    await changePin(id, 'pay', '1234', '5678');
    await expect(verifyPin(id, 'pay', '5678')).resolves.toBeUndefined();
    await expect(setPin(id, 'pay', '1111')).rejects.toMatchObject({ code: 'PIN_ALREADY_SET' });
  });

  it('locks after five incorrect attempts and commits the attempt count', async () => {
    const id = await userId();
    await setPin(id, 'pay', '1234');

    for (let attempt = 0; attempt < 4; attempt++) {
      await expect(verifyPin(id, 'pay', '0000')).rejects.toMatchObject({ code: 'PIN_INVALID' });
    }
    await expect(verifyPin(id, 'pay', '0000')).rejects.toMatchObject({ code: 'PIN_LOCKED' });
    await expect(verifyPin(id, 'pay', '1234')).rejects.toMatchObject({ code: 'PIN_LOCKED' });
  });
});
