import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const GOOD = {
  NODE_ENV: 'development',
  APP_URL: 'http://localhost:3000',
  DATABASE_URL: 'postgres://u:p@localhost/db',
  SESSION_SECRET: 'x'.repeat(32),
  PIN_PEPPER: 'y'.repeat(32),
  ACCOUNTS_ISSUER: 'https://accounts.test/api/oidc',
  ACCOUNTS_CLIENT_ID: 'id',
  ACCOUNTS_CLIENT_SECRET: 'secret',
  SERVICE_CLIENTS: '',
};

function load(overrides: Record<string, string> = {}) {
  vi.resetModules();
  for (const [key, value] of Object.entries({ ...GOOD, ...overrides })) vi.stubEnv(key, value);
  return import('./env');
}

describe('env', () => {
  beforeEach(() => vi.unstubAllEnvs());
  afterEach(() => vi.unstubAllEnvs());

  it(
    'accepts a valid configuration',
    async () => {
      const { env } = await load();
      expect(env.ADMIN_CONFIG_URL).toBe('');
    },
    15_000,
  );

  it('allows a blank database URL in local test runs', async () => {
    const { env } = await load({ DATABASE_URL: '' });
    expect(env.DATABASE_URL).toBe('');
  });

  it('fails boot on a short session secret', async () => {
    await expect(load({ SESSION_SECRET: 'short' })).rejects.toThrow(/SESSION_SECRET/);
  });

  it('rejects a short internal admin secret', async () => {
    await expect(load({ INTERNAL_SHARED_SECRET: 'short' })).rejects.toThrow(
      /INTERNAL_SHARED_SECRET/,
    );
  });

  it('requires an Accounts client secret', async () => {
    await expect(load({ ACCOUNTS_CLIENT_SECRET: '' })).rejects.toThrow(/ACCOUNTS_CLIENT_SECRET/);
  });

  it('requires the Admin config endpoint and bootstrap secret in production', async () => {
    await expect(load({ NODE_ENV: 'production' })).rejects.toThrow(/ADMIN_CONFIG_URL/);
  });

  it('refuses a service client that would act as pay', async () => {
    await expect(load({ SERVICE_CLIENTS: 'spurs-wallet=pay' })).rejects.toThrow(/SERVICE_CLIENTS/);
  });

  it("refuses Pay's own client as a service client", async () => {
    await expect(load({ SERVICE_CLIENTS: 'id=wallet' })).rejects.toThrow(/SERVICE_CLIENTS/);
  });
});
