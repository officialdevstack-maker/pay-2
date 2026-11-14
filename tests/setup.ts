// Defaults so modules that import env.ts load in tests. DATABASE_URL is deliberately NOT defaulted:
// DB tests skip themselves when it is absent.
process.env.APP_URL ??= 'http://localhost:3000';
process.env.SESSION_SECRET ??= 'test-session-secret-test-session-secret';
process.env.PIN_PEPPER ??= 'test-pin-pepper-secret-test-pin-pepper';
process.env.ACCOUNTS_ISSUER ??= 'https://accounts.test/api/oidc';
process.env.ACCOUNTS_CLIENT_ID ??= 'id';
process.env.ACCOUNTS_CLIENT_SECRET ??= 'secret';
process.env.PAYMENTS_DRIVER ??= 'mock';
process.env.SERVICE_CLIENTS ??= 'test-wallet=wallet';
