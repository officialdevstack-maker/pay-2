#!/usr/bin/env node

import nextEnv from '@next/env';
import { createHmac, randomUUID } from 'node:crypto';

nextEnv.loadEnvConfig(process.cwd());

const [accountNumber, naira] = process.argv.slice(2);
if (!accountNumber || !naira || !/^\d+(\.\d{1,2})?$/.test(naira)) {
  console.error('Usage: npm run dev:transfer -- <accountNumber> <amountInNaira>');
  process.exit(1);
}

const [whole, frac = ''] = naira.split('.');
const kobo = BigInt(whole) * 100n + BigInt(frac.padEnd(2, '0'));

const body = JSON.stringify({
  id: `evt_${randomUUID()}`,
  type: 'funding.received',
  accountNumber,
  amountKobo: kobo.toString(),
  senderName: 'Test Sender',
});
const secret = 'mock-webhook-secret';
const signature = createHmac('sha256', secret).update(body).digest('hex');

const base = process.env.APP_URL ?? 'http://localhost:3000';
const response = await fetch(`${base}/api/hooks/payments/${process.env.PAYMENTS_WEBHOOK_TOKEN}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-signature': signature },
  body,
});
console.log(response.status, await response.text());
