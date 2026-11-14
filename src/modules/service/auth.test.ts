import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { authenticateService } from './auth';

let introspections = 0;

function stubAccounts(answer: () => Response) {
  introspections = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.endsWith('/.well-known/openid-configuration')) {
        return Response.json({ introspection_endpoint: 'https://accounts.test/api/oidc/token/introspection' });
      }
      introspections += 1;
      return answer();
    }),
  );
}

const active = (over: Record<string, unknown> = {}) =>
  Response.json({
    active: true,
    client_id: 'test-wallet',
    scope: 'pay:service',
    exp: Math.floor(Date.now() / 1000) + 300,
    ...over,
  });

const call = (token = `tok-${randomUUID()}`) =>
  authenticateService(
    new Request('https://pay.test/api/service/x', { headers: { authorization: `Bearer ${token}` } }),
  );

describe('authenticateService', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('maps a registered client to its product and caches the answer', async () => {
    stubAccounts(() => active());
    const token = `tok-${randomUUID()}`;
    await expect(call(token)).resolves.toEqual({ clientId: 'test-wallet', product: 'wallet' });
    await call(token);
    expect(introspections).toBe(1);
  });

  it('rejects missing or malformed credentials without calling Accounts', async () => {
    stubAccounts(() => active());
    for (const authorization of [undefined, 'Basic abc', 'Bearer', 'Bearer a b']) {
      const headers = authorization ? { authorization } : undefined;
      await expect(
        authenticateService(new Request('https://pay.test/x', { headers })),
      ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    }
    expect(introspections).toBe(0);
  });

  it('rejects inactive or expired tokens', async () => {
    stubAccounts(() => Response.json({ active: false }));
    await expect(call()).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    stubAccounts(() => active({ exp: Math.floor(Date.now() / 1000) - 5 }));
    await expect(call()).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('rejects unregistered clients and tokens without the service scope', async () => {
    stubAccounts(() => active({ client_id: 'someone-else' }));
    await expect(call()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    stubAccounts(() => active({ scope: 'openid profile' }));
    await expect(call()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('fails closed when Accounts is broken or unreachable', async () => {
    stubAccounts(() => new Response('boom', { status: 500 }));
    await expect(call()).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    stubAccounts(() => Response.json({}));
    await expect(call()).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    stubAccounts(() => {
      throw new Error('network down');
    });
    await expect(call()).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  });
});
