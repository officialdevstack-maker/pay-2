# Spurs Pay

Spurs Pay is a payments app built with Next.js, TypeScript, Tailwind CSS,
PostgreSQL, and Drizzle ORM. It includes a BFF sign-in flow with encrypted
server-side sessions and a ledger core; production payment-provider integrations
are not implemented yet.

## Getting started

1. Install Node.js 22 and PostgreSQL access.
2. Copy `.env.example` to `.env.local` and fill in the required values.
3. Install dependencies and generate/apply the database migration:

```bash
npm ci
npm run db:generate
npm run db:migrate
npm run dev
```

The dev server runs at [http://localhost:3000](http://localhost:3000).

## Checks

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run check:leaks
```

The build requires the environment variables documented in `.env.example`.
Register a first-party confidential Spurs Accounts client with the callback
`${APP_URL}/auth/callback` and post-logout URI `${APP_URL}/signed-out`. Set
`ACCOUNTS_CLIENT_ID` and `ACCOUNTS_CLIENT_SECRET` in `.env.local`; the SDK package
is installed from GitHub Packages, so make `NPM_TOKEN` with `read:packages`
available to the npm process before installing dependencies. An `NPM_TOKEN` entry
in `.env.local` alone is not loaded by npm.

PostgreSQL-backed ledger tests run only when `LEDGER_TEST_DATABASE_URL` is set to the
same disposable test database as `DATABASE_URL`; CI provisions and migrates this database.
