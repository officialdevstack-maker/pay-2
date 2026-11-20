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

  it('does not send the bootstrap secret over HTTP in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DATABASE_URL', 'postgres://user:password@localhost/pay');
    vi.stubEnv('PIN_PEPPER', 'p'.repeat(32));
    vi.stubEnv('CONTACT_PEPPER', 'c'.repeat(32));
    vi.stubEnv('EMAIL_DRIVER', 'smtp');
    vi.stubEnv('SMTP_URL', 'smtp://localhost');
    vi.stubEnv('EMAIL_FROM', 'pay@example.test');
    vi.stubEnv('PAYMENTS_WEBHOOK_TOKEN', 'w'.repeat(24));
    vi.stubEnv('ADMIN_IDENTITY_PUBLIC_KEY', 'test public key');
    vi.stubEnv('ADMIN_CONFIG_URL', 'http://admin.test/api/config');

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { getAdminPayConfig } = await import('./admin-config');

    await expect(getAdminPayConfig()).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).not.toHaveBeenCalled();
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

  it('reads runtime policy overrides from Admin config with working defaults', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          app: 'pay',
          config: {
            ...config,
            PAY_CHECKOUT_SESSION_TTL_SECONDS: '7200',
            PAY_BANK_TRANSFER_GRACE_SECONDS: '43200',
            PAY_MAX_AMOUNT_KOBO: '7500000000',
            PAY_METHOD_CARD_TOKENIZATION: 'true',
            PAY_WALLET_PER_TRANSFER_KOBO: '7000000',
            PAY_WALLET_DAILY_DEBIT_KOBO: '30000000',
            PAY_WALLET_MAX_BALANCE_KOBO: '60000000',
          },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { getPayPolicyConfig } = await import('./admin-config');

    const policy = await getPayPolicyConfig();
    expect(policy.checkout.sessionTtlSeconds).toBe(7200);
    expect(policy.checkout.attemptGraceSeconds).toBe(43200);
    expect(policy.checkout.maxAmountKobo).toBe(7_500_000_000n);
    expect(policy.features.cardTokenization).toBe(true);
    expect(policy.walletLimits.pay.perTransferKobo).toBe(7_000_000n);
    expect(policy.walletLimits.pay.dailyDebitKobo).toBe(30_000_000n);
    expect(policy.walletLimits.pay.maxBalanceKobo).toBe(60_000_000n);
  });

  it('creates the active provider from Admin credentials', async () => {
    stubConfigResponse();
    const { getProvider } = await import('./providers');

    const provider = await getProvider();
    expect(provider.driver).toBe('flutterwave');
    expect(provider.verifyWebhook('', new Headers({ 'verif-hash': config.PAY_FLUTTERWAVE_WEBHOOK_SECRET }))).toBe(true);
  });
});
