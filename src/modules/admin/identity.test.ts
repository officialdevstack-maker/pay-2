import { createSign, generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyAdminIdentityToken } from './identity';

const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const privateKey = keys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString();

function token(claims: Record<string, unknown>, key = privateKey) {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signed = `${header}.${payload}`;
  const signer = createSign('RSA-SHA256');
  signer.update(signed);
  signer.end();
  return `${signed}.${signer.sign(key).toString('base64url')}`;
}

function validClaims(nowSeconds: number) {
  return {
    iss: 'admin-2',
    aud: 'spurs-pay',
    sub: '17',
    actor_id: 17,
    email: 'operator@example.test',
    name: 'Pay Operator',
    role: 'Pay Operator',
    permissions: ['pay.view', 'pay.write'],
    auth_time: nowSeconds - 20,
    iat: nowSeconds,
    exp: nowSeconds + 60,
    ip: '192.0.2.10',
    jti: 'request-token-1',
  };
}

describe('Admin identity assertions', () => {
  it('accepts a short-lived assertion signed by Admin 2', () => {
    const now = Math.floor(Date.now() / 1000);
    expect(verifyAdminIdentityToken(token(validClaims(now)), publicKey, now)).toMatchObject({
      sub: '17',
      actorId: 17,
      permissions: ['pay.view', 'pay.write'],
    });
  });

  it('rejects invalid signatures and expired assertions', () => {
    const now = Math.floor(Date.now() / 1000);
    const wrongKey = generateKeyPairSync('rsa', { modulusLength: 2048 })
      .privateKey.export({ type: 'pkcs8', format: 'pem' })
      .toString();
    expect(verifyAdminIdentityToken(token(validClaims(now), wrongKey), publicKey, now)).toBeNull();
    expect(
      verifyAdminIdentityToken(
        token({ ...validClaims(now), exp: now - 1, iat: now - 61 }),
        publicKey,
        now,
      ),
    ).toBeNull();
  });

  it('rejects assertions with another audience or malformed permissions', () => {
    const now = Math.floor(Date.now() / 1000);
    expect(
      verifyAdminIdentityToken(token({ ...validClaims(now), aud: 'another-service' }), publicKey, now),
    ).toBeNull();
    expect(
      verifyAdminIdentityToken(token({ ...validClaims(now), permissions: ['pay.write', 1] }), publicKey, now),
    ).toBeNull();
  });
});
