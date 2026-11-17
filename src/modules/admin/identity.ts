import { createPublicKey, verify as verifySignature } from 'node:crypto';

export type AdminIdentity = {
  sub: string;
  actorId: number;
  email: string;
  name: string;
  role: string | null;
  permissions: string[];
  authTime: number;
  issuedAt: number;
  expiresAt: number;
  ip: string;
  jti: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function decodeSegment(value: string) {
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.toString('base64url') !== value) throw new Error('Malformed token segment.');
  return decoded;
}

export function verifyAdminIdentityToken(
  token: string,
  publicKeyPem: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): AdminIdentity | null {
  try {
    if (token.length > 12_000) return null;
    const parts = token.split('.');
    if (parts.length !== 3 || parts.some((part) => !part)) return null;
    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    if (!encodedHeader || !encodedPayload || !encodedSignature) return null;
    const header: unknown = JSON.parse(decodeSegment(encodedHeader).toString('utf8'));
    const payload: unknown = JSON.parse(decodeSegment(encodedPayload).toString('utf8'));
    if (!isRecord(header) || header.alg !== 'RS256' || header.typ !== 'JWT' || !isRecord(payload)) {
      return null;
    }

    const key = createPublicKey(publicKeyPem.replace(/\\n/g, '\n'));
    if (
      key.asymmetricKeyType !== 'rsa' ||
      (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048 ||
      !verifySignature(
        'RSA-SHA256',
        Buffer.from(`${encodedHeader}.${encodedPayload}`),
        key,
        decodeSegment(encodedSignature),
      )
    ) {
      return null;
    }

    const { iss, aud, sub, actor_id, email, name, role, permissions, auth_time, iat, exp, ip, jti } =
      payload;
    if (
      iss !== 'admin-2' ||
      aud !== 'spurs-pay' ||
      typeof sub !== 'string' ||
      !sub ||
      typeof actor_id !== 'number' ||
      !Number.isSafeInteger(actor_id) ||
      actor_id < 1 ||
      sub !== String(actor_id) ||
      typeof email !== 'string' ||
      !email ||
      typeof name !== 'string' ||
      (role !== null && typeof role !== 'string') ||
      !Array.isArray(permissions) ||
      !permissions.every((permission) => typeof permission === 'string') ||
      typeof auth_time !== 'number' ||
      !Number.isSafeInteger(auth_time) ||
      typeof iat !== 'number' ||
      !Number.isSafeInteger(iat) ||
      typeof exp !== 'number' ||
      !Number.isSafeInteger(exp) ||
      typeof ip !== 'string' ||
      typeof jti !== 'string' ||
      !jti ||
      exp <= nowSeconds ||
      iat > nowSeconds + 30 ||
      exp <= iat ||
      exp - iat > 60 ||
      auth_time > nowSeconds + 30
    ) {
      return null;
    }

    return {
      sub,
      actorId: actor_id,
      email,
      name,
      role,
      permissions,
      authTime: auth_time,
      issuedAt: iat,
      expiresAt: exp,
      ip,
      jti,
    };
  } catch {
    return null;
  }
}

export function hasAdminPermission(admin: AdminIdentity, permission: string) {
  return admin.permissions.includes('*') || admin.permissions.includes(permission);
}
