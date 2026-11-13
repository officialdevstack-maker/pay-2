import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertNotSuspended } from './status';

const calls: string[] = [];

function stubAccounts(userResponse: () => Response) {
  calls.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request) => {
      const url = input instanceof Request ? input.url : String(input);
      calls.push(url);
      if (url.endsWith('/.well-known/openid-configuration')) {
        return Response.json({ token_endpoint: 'https://accounts.test/api/oidc/token' });
      }
      if (url.endsWith('/token')) return Response.json({ access_token: 'svc', expires_in: 300 });
      return userResponse();
    }),
  );
}

const userCalls = () => calls.filter((url) => url.includes('/api/internal/users/')).length;
const sub = () => `user-${randomUUID()}`;

describe('assertNotSuspended', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('allows an active user and caches the answer', async () => {
    stubAccounts(() => Response.json({ suspendedAt: null }));
    const userId = sub();
    await expect(assertNotSuspended(userId)).resolves.toBeUndefined();
    await expect(assertNotSuspended(userId)).resolves.toBeUndefined();
    expect(userCalls()).toBe(1);
  });

  it('blocks a suspended user', async () => {
    stubAccounts(() => Response.json({ suspendedAt: '2026-11-01T00:00:00Z' }));
    await expect(assertNotSuspended(sub())).rejects.toMatchObject({ code: 'ACCOUNT_SUSPENDED' });
  });

  it('fails closed when the status response is malformed, rejected or unreachable', async () => {
    stubAccounts(() => Response.json({}));
    await expect(assertNotSuspended(sub())).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });

    stubAccounts(() => new Response('boom', { status: 500 }));
    await expect(assertNotSuspended(sub())).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });

    stubAccounts(() => {
      throw new Error('network down');
    });
    await expect(assertNotSuspended(sub())).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  });
});
