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
  PAYMENTS_DRIVER: 'mock',
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
      expect(env.PAYMENTS_DRIVER).toBe('mock');
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

  it('requires an Accounts client secret', async () => {
    await expect(load({ ACCOUNTS_CLIENT_SECRET: '' })).rejects.toThrow(/ACCOUNTS_CLIENT_SECRET/);
  });

  it('refuses the mock driver in production', async () => {
    await expect(load({ NODE_ENV: 'production' })).rejects.toThrow(/mock driver/);
  });

  it('requires credentials for a real driver', async () => {
    await expect(load({ PAYMENTS_DRIVER: 'placeholder' })).rejects.toThrow(/PAYMENTS_SECRET_KEY/);
  });
});
