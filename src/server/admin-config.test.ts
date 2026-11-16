import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const config = {
  PAY_PROVIDER: 'flutterwave',
  PAY_FLUTTERWAVE_SECRET_KEY: 'test-secret-key',
  PAY_FLUTTERWAVE_WEBHOOK_SECRET: 'test-webhook-secret',
};

function stubConfigResponse() {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ app: 'pay', config }), { status: 200 }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('admin payment config', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('APP_URL', 'http://localhost:3000');
    vi.stubEnv('SESSION_SECRET', 's'.repeat(32));
    vi.stubEnv('ACCOUNTS_ISSUER', 'https://accounts.test/oidc');
    vi.stubEnv('ACCOUNTS_CLIENT_ID', 'pay-test');
    vi.stubEnv('ACCOUNTS_CLIENT_SECRET', 'test-client-secret');
    vi.stubEnv('ADMIN_CONFIG_URL', 'https://admin.test/api/config');
    vi.stubEnv('ADMIN_BOOTSTRAP_SECRET', 'b'.repeat(32));
    vi.stubEnv('SERVICE_CLIENTS', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('fetches Pay config with the Admin bootstrap header and caches it', async () => {
    const fetchMock = stubConfigResponse();
    const { getAdminPayConfig } = await import('./admin-config');

    await expect(getAdminPayConfig()).resolves.toEqual(config);
    await expect(getAdminPayConfig()).resolves.toEqual(config);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://admin.test/api/config?app=pay');
    expect((options as RequestInit).headers).toEqual({ 'x-admin-bootstrap': 'b'.repeat(32) });
  });

  it('accepts only the active provider webhook token', async () => {
    stubConfigResponse();
    const { verifyProviderWebhookToken } = await import('./admin-config');

    await expect(
      verifyProviderWebhookToken('flutterwave', 'test-webhook-secret'),
    ).resolves.toBe(true);
    await expect(
      verifyProviderWebhookToken('flutterwave', 'wrong-token'),
    ).resolves.toBe(false);
    await expect(
      verifyProviderWebhookToken('paymentpoint', 'test-webhook-secret'),
    ).resolves.toBe(false);
  });

  it('creates the active provider from Admin credentials', async () => {
    stubConfigResponse();
    const { getProvider } = await import('./providers');

    const provider = await getProvider();
    expect(provider.driver).toBe('flutterwave');
    expect(provider.verifyWebhook('', new Headers({ 'verif-hash': config.PAY_FLUTTERWAVE_WEBHOOK_SECRET }))).toBe(true);
  });
});
