# Spurs Pay: Build TODO

Spurs Pay is a Google Pay-style payments app: a **full-stack Next.js app** that signs users in with **Spurs Accounts** (OIDC) and moves money through a **hidden payment provider**. Spurs Wallet will later be built from this codebase, so every decision below favours reusable modules.

Tick items as they land. Do not start a phase until the previous phase's "Done when" is true.

---

## 0. Ground rules (read before every task)

### Money
- [ ] Amounts are **integer kobo** (`bigint` in the DB, `number` safe-integer or `bigint` in TS). Never floats, never `decimal` maths in JS.
- [ ] Format only at the edge: `Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' })`.
- [ ] **Ledger entries are immutable.** Corrections are new reversing entries, never edits or deletes.
- [ ] Every transaction balances: sum of debits equals sum of credits.
- [ ] Every money-changing write needs an **idempotency key**. Replays return the original result.
- [ ] Balances change only inside the ledger module, inside a DB transaction.

### Provider secrecy (users must never learn who the provider is)
- [ ] Provider code lives only in `src/server/providers/<driver>/` and is imported only through the `PaymentProvider` interface.
- [ ] Every provider file starts with `import 'server-only'`.
- [ ] No provider name in: client bundles, URLs, route names, response bodies, error messages, emails, receipts, references, DB enum values shown to users, page titles, or public env vars.
- [ ] Provider errors are **mapped** to our own error codes and messages. Raw provider messages go to server logs only.
- [ ] References we create use our prefix (`SPY_`), never the provider's format. Provider references stay in internal columns and are never serialised to the client.
- [ ] Webhook route is neutral (`/api/hooks/payments/[token]`), with an unguessable path token plus signature verification.
- [ ] CI check: build, then grep `.next/static` and the HTML for provider names, failing on any match.
- [ ] Swapping the provider must require **zero changes outside** `src/server/providers/`, one env value (`PAYMENTS_DRIVER`), and credentials.

### Reusability (so Wallet can grow from Pay)
- [ ] Domain logic lives in `src/modules/*` with **no imports from `app/` or React**. UI calls modules; modules never call UI.
- [ ] `ledger`, `identity`, `payments`, `notifications` are written as if they were separate packages (own `index.ts` public API, no deep imports from outside).
- [ ] Wallets carry a `product` column (`pay` now, `wallet` later) so both can share one ledger.
- [ ] Keep the layout monorepo-ready; do not extract packages until Wallet actually starts.

### Code conventions
- [ ] TypeScript strict, `noUncheckedIndexedAccess`, ESM, `@/` alias to `src/`.
- [ ] All env access goes through one validated `src/env.ts` (zod). Boot fails on missing or invalid values.
- [ ] Mutations are **server actions or route handlers that call module services**. No business logic in components.
- [ ] Every service returns a typed result or throws a typed `AppError(code, message, status)`. The UI shows only `message`.
- [ ] Tests alongside the module (`*.test.ts`). Ledger and transfer code needs concurrency tests before it ships.

---

## 1. Stack decisions (confirm, then freeze)

- [ ] Next.js App Router, React, TypeScript, Tailwind, shadcn/ui, Framer Motion
- [ ] PostgreSQL (needed for row locks and serialisable transactions) with an ORM or query builder: **Drizzle or Prisma** (pick one)
- [ ] Background jobs and retries for webhooks, withdrawals and reconciliation: Redis + BullMQ, or a hosted queue
- [ ] Session: encrypted httpOnly cookie (`iron-session` or `jose`), with tokens kept server-side only
- [ ] Rate limiting: Redis-backed (Upstash or ioredis)
- [ ] Email: reuse the Accounts mail approach (SMTP via nodemailer, or a transactional API)
- [ ] Hosting: Vercel (app) + managed Postgres + Redis. Webhooks need a stable public URL

---

## 2. Folder layout

```
src/
  app/                      # routes, layouts, server actions (thin)
    (auth)/                 # login callback, logout
    (app)/                  # authenticated shell: home, send, request, activity, settings
    api/
      auth/[...]/           # OIDC start + callback (BFF)
      hooks/payments/[token]/  # neutral provider webhook entry
  components/               # UI only
  modules/
    identity/               # session, Accounts client, user status checks
    ledger/                 # accounts, entries, balances, transfers (pure domain)
    wallet/                 # wallet lifecycle, limits, PIN
    payments/               # funding, withdrawals, reconciliation (uses providers)
    notifications/
  server/
    providers/
      types.ts              # PaymentProvider interface + normalised events
      index.ts              # resolves driver from PAYMENTS_DRIVER
      <driver>/             # the ONLY place provider names appear
    db/                     # client, schema, migrations
    jobs/
  lib/                      # format, ids, errors, small utils
  env.ts
```

---

## 3. Phases

### Phase 1: Foundations
- [ ] Scaffold app, strict TS, ESLint, Prettier, path alias
- [ ] `src/env.ts` with zod validation and `.env.example` (no provider names in `NEXT_PUBLIC_*`)
- [ ] DB client and migration tooling; first migration runs in CI
- [ ] `AppError`, error-to-response mapper, request id, structured logger (redact tokens, PINs, account numbers)
- [ ] Design tokens: colour, type scale, radius, spacing, light and dark; Naira formatter; base components
- [ ] CI: typecheck, lint, test, build, **provider-name leak check**

**Done when:** a blank authenticated-shell route renders in light and dark, CI is green, and a bad env value fails boot.

### Phase 2: Sign-in with Spurs Accounts (BFF)
- [ ] Register Spurs Pay in Accounts as a **first-party confidential** client (`oidc:client:create "Spurs Pay" --first-party ...`), with redirect and post-logout URIs
- [ ] Install `@spurs/auth` (GitHub Packages scope `@spurs`: add `.npmrc` with a read token locally and in CI)
- [ ] `/api/auth/login`: `createAuthorizationRequest`, keep state, nonce and verifier in a short-lived server session, redirect
- [ ] `/api/auth/callback`: `exchangeCode`, verify ID token, create the encrypted session, redirect to `returnTo` (same-origin only)
- [ ] Session stores tokens server-side only. The browser never sees an access or refresh token
- [ ] **Single-flight refresh** per session (lock or in-memory promise map plus DB/Redis lock). Never refresh in parallel: Accounts treats refresh reuse outside the grace window as theft and revokes the grant
- [ ] Logout: revoke refresh token, clear the session, optionally `signOutEverywhere`
- [ ] Route protection in middleware plus a server-side `requireUser()` used by every action
- [ ] **Status guard**: on money actions call Accounts `/api/internal/users/{id}` with a `users:read` service token, reject if `suspendedAt` is set; cache 30 to 60s. (Introspection alone does not catch suspension.)
- [ ] Require `email_verified` before any send or withdrawal; show a clear "verify your email" state
- [ ] Step-up: sensitive actions (add bank account, change PIN) re-auth with `prompt=login&max_age=300`
- [ ] Map `sub` (Accounts user id) to `pay_users` on first login (create on first sight)

**Done when:** login, logout, expiry, concurrent refresh and a suspended user are all covered by tests, and no token appears in any client response.

### Phase 3: Ledger core
- [ ] Schema: `ledger_accounts`, `transactions`, `ledger_entries`, `idempotency_keys` (+ `wallets` with `product`, `currency`, cached `balance`, `version`)
- [ ] Ledger service API: `post(transaction, entries[])` validates balance, currency and idempotency, inside one DB transaction
- [ ] System accounts: `provider_clearing`, `fees`, `suspense`, `settlement`
- [ ] Balance rules: wallets cannot go negative (DB `CHECK` as the last line of defence)
- [ ] Locking: lock wallets **in ascending id order** to prevent deadlocks
- [ ] Reversal helper (creates mirrored entries linked to the original)
- [ ] Tests: concurrent transfers, double submit with the same key, insufficient funds, rollback on failure, reversal, invariant check (global debits equal credits)

**Done when:** a stress test of parallel transfers leaves every balance correct and the global ledger balanced.

### Phase 4: Provider abstraction
- [ ] Define `PaymentProvider`: `listBanks`, `resolveAccount` (name enquiry), `createFundingAccount` (per-user virtual account), `initiateTransfer`, `getTransferStatus`, `verifyWebhook`, `parseWebhook` (to normalised events)
- [ ] Normalised event types: `funding.received`, `payout.succeeded`, `payout.failed`, `payout.reversed`
- [ ] Error mapper: provider error to `AppError` with our codes (`FUNDING_UNAVAILABLE`, `PAYOUT_FAILED`, `ACCOUNT_NOT_FOUND`, ...)
- [ ] First adapter in `providers/<driver>/`; plus a **`mock` driver** for tests and local dev
- [ ] `providers/index.ts` picks the driver from `PAYMENTS_DRIVER`; nothing else imports an adapter
- [ ] Webhook entry: verify signature, store raw event in `webhook_events` (unique by provider event id), enqueue, return 200 fast
- [ ] Idempotent event processor: replays never double-credit
- [ ] Outbound calls: timeouts, retries with backoff, circuit-breaker logging

**Done when:** the whole app runs end to end on the `mock` driver, and the leak check passes with the real adapter included.

### Phase 5: Funding (add money)
- [ ] Per-user dedicated funding account details shown as **"Spurs Pay account"** (no provider branding in copy or UI)
- [ ] On `funding.received`: credit wallet via the ledger, keyed by the provider event id (idempotent), notify the user
- [ ] Card funding only if it can be done without exposing the provider's brand; otherwise defer and document the trade-off
- [ ] Pending, success and failed states in the UI; no balance change until the webhook is processed

**Done when:** a mock deposit appears in the wallet once, even if the webhook is delivered five times.

### Phase 6: Wallet, PIN and limits
- [ ] Transaction PIN: set, change, verify. Hash with argon2/bcrypt, attempt counter, temporary lockout, never logged
- [ ] Limit tiers (per-transaction, daily, max balance) in config, enforced in the wallet module before any debit
- [ ] Wallet auto-created on first login (`product = 'pay'`)
- [ ] Rate limits on PIN verify and sends (per user and per IP)

### Phase 7: Send money (P2P)
- [ ] Recipient lookup by phone, email or `@tag` (add `tag` and privacy setting); show name only, never email or phone of non-contacts
- [ ] Transfer service: validate, check status guard, PIN, limits, idempotency key, ledger post, notify both sides
- [ ] Beneficiaries/recent people, with search
- [ ] Failure handling: insufficient balance, recipient not found, limit hit, PIN locked, all via `AppError` codes
- [ ] Concurrency and double-tap tests (UI generates one idempotency key per intent)

### Phase 8: Activity, receipts, notifications
- [ ] Activity feed (cursor pagination, filters, search) built from ledger entries
- [ ] Receipt page and shareable image/PDF with our reference (`SPY_...`)
- [ ] In-app notifications; email for credits, debits, security events
- [ ] Optional: push (PWA) later

### Phase 9: UI/UX pass (runs alongside, locked in here)
- [ ] Home: balance card (hide/show), quick actions (Send, Request, Scan, Add money), people row, recent activity
- [ ] Send flow: recipient, custom amount keypad, note, review, PIN sheet, animated success, receipt
- [ ] Loading skeletons, optimistic activity updates, empty states, error toasts with a retry
- [ ] Haptics on mobile, safe-area handling, 44px touch targets, reduced-motion support
- [ ] Accessibility: focus order, labels, contrast, screen-reader amounts ("two thousand naira")
- [ ] PWA: manifest, icons, install prompt, offline shell

### Phase 10: Withdrawals / bank transfer
- [ ] Add bank account with name enquiry; require step-up auth
- [ ] Payout flow: reserve funds (hold entry), `initiateTransfer`, state machine `pending, success, failed`
- [ ] On `payout.failed` or `payout.reversed`: auto reversal entries and a notification
- [ ] Scheduled **reconciliation job**: compare pending payouts against provider status, fix stuck items
- [ ] Fees: configured in one place, posted to the `fees` account, shown before confirmation

### Phase 11: Request money, QR, links
- [ ] Money requests (create, accept, decline, expire)
- [ ] Personal QR and "pay me" link (amount optional), scan to pay
- [ ] Share sheet for links and receipts

### Phase 12: Bills (airtime, data)
- [ ] Decide: reuse the existing VTU platform via a service client, or call a provider directly
- [ ] Purchase flow reuses PIN, limits, idempotency and ledger exactly like transfers

### Phase 13: Hardening and launch
- [ ] Security headers/CSP, CSRF checks on mutating routes, strict CORS
- [ ] Rate limits everywhere money moves; abuse signals (velocity, new-device sends)
- [ ] Audit log for every money and security event, with actor, IP and device
- [ ] Observability: error tracking, structured logs with redaction, ledger-balance alarm, stuck-payout alarm
- [ ] Backups and a tested restore; migration rollback plan
- [ ] Load test on transfers; pen-test checklist; privacy and data-export hooks consistent with Accounts
- [ ] Runbooks: provider outage, webhook backlog, reconciliation mismatch, user dispute

---

## 4. Spurs Wallet readiness (do not build yet, just do not block it)

- [ ] `wallets.product` and per-product limits already in schema
- [ ] Ledger and payments modules have no Pay-specific UI or copy
- [ ] Notifications and identity modules are product-agnostic
- [ ] When Wallet starts: extract `modules/*` and `server/providers` into workspace packages, then add the Wallet app

---

## 5. Definition of done (every feature)

- [ ] Types strict, no `any` in money paths
- [ ] Unit tests plus a concurrency or replay test for anything that moves money
- [ ] Idempotent and safe to retry
- [ ] Errors mapped to our codes, with user-friendly messages and no provider detail
- [ ] Provider-name leak check passes
- [ ] Works on mobile viewport, dark mode, and with reduced motion
- [ ] Logged and audited, with no secrets, PINs, or full account numbers in logs

---

## 6. Open decisions

- [ ] ORM: Drizzle vs Prisma
- [ ] Job runner: BullMQ vs hosted queue
- [ ] Card funding in v1, or bank-transfer funding only
- [ ] KYC tier thresholds and limit values
- [ ] `@tag` rules (length, reserved words, changeability)
- [ ] Fee schedule