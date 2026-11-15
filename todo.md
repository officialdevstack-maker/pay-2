# Spurs Pay: Build TODO

Spurs Pay is the payment-methods and hosted-checkout service for **Spurs-owned products and approved external merchants** in the first release. Spurs products use a private authenticated integration; external merchants use managed onboarding, scoped API credentials, signed payment webhooks, and settlement. **Spurs Wallet is a separate service** that owns Wallet balances and its customer UI; it uses Pay's authenticated service API to fund Wallet. Pay does not own customer balances or expose P2P transfer screens.

Tick items as they land. Do not start a phase until the previous phase's "Done when" is true.

**Status:** The existing auth, ledger, provider, funding, Wallet, and P2P modules remain in the repository. P2P routes and the `product='pay'` customer wallet are legacy implementation, not the new Pay product scope; retain them for review/reuse and do not expand their UI. Checkout, payment methods, and Wallet funding through the service API are not implemented. Items marked `(partial)` or `(stub)` are not fully done.

---

## 0. Ground rules (read before every task)

### Money
- [x] Amounts are **integer kobo** (`bigint` in the DB, `number` safe-integer or `bigint` in TS). Never floats, never `decimal` maths in JS.
- [x] Format only at the edge: `Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' })`.
- [x] **Ledger entries are immutable.** Corrections are new reversing entries, never edits or deletes. (Enforced by DB triggers.)
- [x] Every transaction balances: sum of debits equals sum of credits. (App validation + deferred DB constraint triggers.)
- [x] Every money-changing write needs an **idempotency key**. Replays return the original result.
- [x] Balances change only inside the ledger module, inside a DB transaction.
- [ ] Pay must not create or display a customer balance. Spurs Wallet is the sole owner of Wallet balances; cross-service debits require the approved Wallet authorization contract.

### Provider secrecy (users must never learn who the provider is)
- [x] Provider code lives only in `src/server/providers/<driver>/` and is imported only through the `PaymentProvider` interface.
- [x] Every provider file starts with `import 'server-only'`.
- [ ] No provider name in: client bundles, URLs, route names, response bodies, error messages, emails, receipts, references, DB enum values shown to users, page titles, or public env vars. (partial: holds for the mock; re-verify with the real adapter, including the bank name it returns)
- [x] Provider errors are **mapped** to our own error codes and messages. Raw provider messages go to server logs only.
- [x] References we create use our prefix (`SPY_`), never the provider's format. Provider references stay in internal columns and are never serialised to the client.
- [ ] Card entry is tokenized/embedded; raw PAN and CVV never reach Pay. Resolve the provider-brand conflict before enabling card checkout.
- [x] Webhook route is neutral (`/api/hooks/payments/[token]`), with an unguessable path token plus signature verification.
- [x] CI check: build, then grep `.next/static` and the HTML for provider names, failing on any match.
- [ ] Swapping the provider must require **zero changes outside** `src/server/providers/`, one env value (`PAYMENTS_DRIVER`), and credentials. (Only the mock exists; prove it with the first real adapter.)

### Reusability (Wallet is a separate service that calls Pay)
- [x] Domain logic lives in `src/modules/*` with **no imports from `app/` or React**. UI calls modules; modules never call UI.
- [ ] `ledger`, `identity`, `payments`, `notifications` are written as if they were separate packages (own `index.ts` public API, no deep imports from outside). (identity is still a stub)
- [x] Wallets carry a `product` column; the current `pay` customer wallet is legacy and the Wallet service uses `wallet`.
- [x] PINs and limits are keyed by `product`, so Wallet gets its own without touching Pay's code.
- [x] Wallet service must never share Pay's database; it only talks to Pay's service API (see Phase 6b).
- [ ] Pay may not read or write Wallet's database. Wallet is authoritative for its balance and authorizes any Wallet-funded checkout.

### Code conventions
- [x] TypeScript strict, `noUncheckedIndexedAccess`, ESM, `@/` alias to `src/`.
- [x] All env access goes through one validated `src/env.ts` (zod). Boot fails on missing or invalid values.
- [ ] Mutations are **server actions or route handlers that call module services**. No business logic in components. (Only the webhook route exists so far.)
- [x] Every service returns a typed result or throws a typed `AppError(code, message, status)`. The UI shows only `message`.
- [x] Tests alongside the module (`*.test.ts`). Ledger and transfer code needs concurrency tests before it ships.

---

## 1. Stack decisions (confirm, then freeze)

- [ ] Next.js App Router, React, TypeScript, Tailwind, shadcn/ui, Framer Motion (partial: Next, React, TS, Tailwind in; own base components instead of shadcn; no Framer Motion yet)
- [x] PostgreSQL with **Drizzle** (decided)
- [ ] Background jobs and retries for webhooks, withdrawals and reconciliation: Redis + BullMQ, or a hosted queue (interim: inline processing plus `processPendingEvents()`)
- [ ] Session: encrypted httpOnly cookie (`iron-session` or `jose`), with tokens kept server-side only
- [ ] Rate limiting: Redis-backed (Upstash or ioredis) (interim: Postgres fixed-window in `src/lib/rate-limit.ts`, behind one function)
- [ ] Email: reuse the Accounts mail approach (SMTP via nodemailer, or a transactional API)
- [ ] Hosting: Vercel (app) + managed Postgres + Redis. Webhooks need a stable public URL

---

## 2. Folder layout

```
src/
  app/                      # routes, layouts, server actions (thin)
    (auth)/                 # login callback, logout
    (app)/                  # authenticated shell: home, payment methods, activity, settings
      checkout/[id]/        # hosted checkout session
    api/
      auth/[...]/           # OIDC start + callback (BFF)
      hooks/payments/[token]/  # neutral provider webhook entry
      service/              # service API for Spurs Wallet (Phase 6b)
  components/               # UI only
  config/                   # fees, limits (single source of truth)
  modules/
    identity/               # session, Accounts client, user status checks
    ledger/                 # accounts, entries, payment postings (pure domain)
    wallet/                 # legacy Pay wallet code; Wallet product support pending service contract
    payments/               # Wallet funding, checkout, reconciliation (uses providers)
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
- [x] Scaffold app, strict TS, ESLint, path alias (Prettier not added)
- [x] `src/env.ts` with zod validation and `.env.example` (no provider names in `NEXT_PUBLIC_*`)
- [x] DB client and migration tooling; first migration runs in CI
- [x] `AppError`, error-to-response mapper, request id, structured logger (redact tokens, PINs, account numbers)
- [x] Design tokens: colour, type scale, radius, spacing, light and dark; Naira formatter; base components
- [x] CI: typecheck, lint, test, build, **provider-name leak check**

**Done when:** a blank authenticated-shell route renders in light and dark, CI is green, and a bad env value fails boot.
- [x] Verified (shell renders, CI configured, env tests cover boot failure)

### Phase 2: Sign-in with Spurs Accounts (BFF)
- [x] Register Spurs Pay in Accounts as a **first-party confidential** client (`oidc:client:create "Spurs Pay" --first-party ...`), with redirect and post-logout URIs
- [x] Install `@spurs/auth` (GitHub Packages scope `@spurs`: add `.npmrc` with a read token locally and in CI)
- [x] `/auth/login`: `createAuthorizationRequest`, keep state, nonce and verifier in a short-lived encrypted server-side record, redirect
- [x] `/auth/callback`: `exchangeCode` verifies the ID token, creates the encrypted session, and redirects to same-origin `returnTo`
- [x] Session stores tokens server-side only. The browser receives only the opaque session cookie
- [x] **Single-flight refresh** per session uses a database row lock; never refresh in parallel
- [x] Logout revokes the refresh token, clears the session, and redirects through the Accounts end-session endpoint when available
- [x] Route protection in `src/proxy.ts` plus server-side `requireUser()`/API guards
- [x] **Status guard**: money actions call Accounts `/api/internal/users/{id}` with a `users:read` service token, reject if `suspendedAt` is set; cached for 45s
- [x] Require `email_verified` before current send/withdraw actions; show a clear "verify your email" error
- [ ] Step-up: helper requests `prompt=login&max_age=300`; consumers will be added with change-PIN and add-bank flows
- [x] Map `sub` (Accounts user id) to `pay_users` on first login
- [ ] Stop creating `product='pay'` customer wallets on first login after legacy balances and funding records are reconciled; do not delete data without a migration plan

**Done when:** the Accounts client is registered and the login/logout smoke test passes; DB-gated tests cover login, logout, expiry, concurrent refresh and suspension, and no token appears in any client response.

### Phase 3: Ledger core
- [x] Schema: `ledger_accounts`, `transactions`, `ledger_entries`, `idempotency_keys` (+ `wallets` with `product`, `currency`, cached `balance`, `version`)
- [x] Ledger service API: `post(transaction, entries[])` validates balance, currency and idempotency, inside one DB transaction
- [x] System accounts: `provider_clearing`, `fees`, `suspense`, `settlement`
- [ ] Define payment posting entries from the selected payment source to the merchant's ledger account, including linked reversals and settlement
- [x] Balance rules: wallets cannot go negative (DB `CHECK` as the last line of defence)
- [x] Locking: lock accounts **in ascending id order** to prevent deadlocks
- [x] Reversal helper (creates mirrored entries linked to the original)
- [x] Tests: concurrent transfers, double submit with the same key, insufficient funds, rollback on failure, reversal, invariant check (global debits equal credits)

**Done when:** a stress test of parallel transfers leaves every balance correct and the global ledger balanced.
- [ ] Run `npm test` against a disposable Postgres and confirm green

### Phase 4: Provider abstraction
- [x] Define `PaymentProvider`: `listBanks`, `resolveAccount` (name enquiry), `createFundingAccount` (per-user virtual account), `initiateTransfer`, `getTransferStatus`, `verifyWebhook`, `parseWebhook` (to normalised events)
- [ ] Extend the provider contract for tokenized card checkout and card top-up without exposing raw card data or provider branding
- [x] Normalised event types: `funding.received`, `payout.succeeded`, `payout.failed`, `payout.reversed`
- [x] Error mapper: provider error to `AppError` with our codes (`FUNDING_UNAVAILABLE`, `PAYOUT_FAILED`, `ACCOUNT_NOT_FOUND`, ...)
- [ ] First adapter in `providers/<driver>/` (needs a vendor choice and credentials); plus a **`mock` driver** for tests and local dev (mock done, real adapter not)
- [x] `providers/index.ts` picks the driver from `PAYMENTS_DRIVER`; nothing else imports an adapter
- [x] Webhook entry: verify signature, store raw event in `webhook_events` (unique by provider event id), process, return 200 fast
- [x] Idempotent event processor: replays never double-credit
- [x] Outbound calls: timeouts, retries with backoff, circuit-breaker logging (`providerFetch`)

**Done when:** the whole app runs end to end on the `mock` driver, and the leak check passes with the real adapter included.
- [ ] Verified on mock
- [ ] Leak check passes with the real adapter included

### Phase 5: Wallet funding through Pay
- [x] Existing per-user funding-account details and `funding.received` processing are implemented for the legacy `product='pay'` wallet.
- [ ] Move funding-account details and bank-transfer/card top-up initiation behind the authenticated Wallet service API. Wallet owns the customer-facing funding UI.
- [ ] Map every funding request to the server-authorized `wallet` product; never accept a product value from the request body.
- [ ] Credit Wallet only through the agreed Wallet service contract, keyed by a provider event/idempotency key. Unmatched deposits go to `suspense`.
- [ ] Represent pending, success, failure, replay and unknown-outcome states in the service contract. Do not expose a Pay Add money page.
- [ ] Keep card top-up disabled until tokenization and provider-brand requirements are resolved.

**Done when:** a mock bank-transfer or card top-up requested by Wallet credits Wallet exactly once and never creates or mutates a Pay customer balance.
- [ ] Run funding replay and failure tests against disposable Postgres

### Phase 6: Wallet, PIN and limits
- [x] Transaction PIN: set, change, verify. scrypt with a server-side pepper, attempt counter, temporary lockout, never logged. Keyed by `(user, product)`.
- [x] Limit tiers (per-transaction, daily, max balance) in `src/config/limits.ts`, enforced in the wallet module before any debit. **Values are placeholders.**
- [x] Legacy Pay wallet is auto-created on first login (`product = 'pay'`); remove this after a safe data reconciliation/migration.
- [x] Rate limits on PIN verify and sends (per user and per IP) (Postgres fixed-window counters; IP limits use the ingress-provided `x-real-ip` header)
- [ ] Wallet remains the owner of its balance and PIN. Pay checkout must use the approved Wallet authorization contract and must not collect or verify a Pay-owned PIN.

**Done when:** Wallet's product limits and PIN are isolated from legacy Pay data, and no Pay UI or API treats a customer balance as Pay-owned.
- [ ] Verified

### Phase 6b: Service API for Spurs Wallet (new)
Wallet is a separate service. It calls Pay for money movement and shares Accounts for auth. Depends on Phase 2 and on how Accounts issues service tokens.
- [ ] Authenticate Wallet's calls with an Accounts-issued token for a confidential client (or mTLS / signed service token)
- [ ] Map the calling client id to its allowed product **server-side**, never from the request body
- [ ] Endpoints under `/api/service/`: Wallet funding-account details, bank-transfer/card top-up initiation and status; Wallet balance, PIN, transfer, payout, and activity where required
- [ ] Idempotency key required on every money endpoint, scoped by caller
- [ ] Agree whether Pay asks Wallet to debit/authorize, or Wallet authorizes through a Pay contract. Establish one source of truth for Wallet debit and replay behavior.
- [ ] Decide how checkout receives Wallet authorization without moving or storing the Wallet PIN in Pay.
- [ ] Contract tests: a Wallet caller can act only on the Wallet product and cannot read or move Pay-product or other-product funds

**Done when:** Wallet can securely retrieve funding details, initiate and reconcile top-ups, and perform only explicitly authorized operations for its own product.

### Phase 7: Merchant checkout (replaces P2P UI and request/QR phases)
- [ ] Define private authenticated integration for Spurs products and a managed onboarding/approval contract for external merchants
- [ ] Issue scoped external merchant API credentials with secure one-time display, rotation, revocation, audit, and rate limits; store no recoverable secret
- [x] Create checkout sessions for the authenticated merchant with server-owned amount/currency, reference, expiry, method eligibility, and idempotent creation
- [x] Build `/checkout/[id]`: summary, method choice, confirmation, pending/unknown outcome, success and failure
- [x] Enforce merchant ownership for session lookup, status, activity, and return URLs; never trust browser-supplied merchant identity or redirect targets
- [ ] Add payment-method storage for provider tokens and safe card display metadata only; never store PAN/CVV
- [ ] Implement Spurs Wallet authorization using the agreed Wallet/Pay source-of-truth contract
- [ ] Implement card payment with approved tokenization and provider-neutral UI
- [x] Implement bank-transfer checkout with verified webhook status and safe pending/retry handling
- [x] Post a balanced `payment` transaction to the merchant ledger account; idempotent retries and linked reversals
- [x] Define authenticated status polling for Spurs products at `GET /api/merchant/checkout-sessions/{reference}`
- [ ] Define signed, retryable webhook delivery for external merchants
- [ ] Tests: session ownership/expiry, amount tampering, each method, concurrent submit, idempotency replay/mismatch, unknown outcome, reversal

### Phase 8: Activity, receipts, notifications
- [ ] Activity feed of checkout payments (cursor pagination as volume requires); keep Wallet top-ups in Wallet activity
- [ ] Payment detail/receipt with merchant, method summary, status, date and our reference (`SPY_...`)
- [ ] Notify customers and merchants only from server-confirmed payment state; sign and retry external webhooks, and make delivery replay-safe
- [ ] Optional: push (PWA) later

### Phase 9: UI/UX pass (runs alongside, locked in here)
- [x] Home: payment-method summary, Add payment method action, setup requirements, recent payments
- [x] Payment methods: Wallet availability, tokenized saved cards, bank transfer option; no Pay balance or Add money page
- [ ] Checkout: responsive method selection and method-specific states
- [ ] Activity and payment detail/receipt
- [ ] Settings: Accounts profile link, appearance, sign out; no Pay tag or PIN
- [ ] Loading skeletons, empty states, and error states with safe retries; never show an optimistic payment success
- [ ] Haptics on mobile, safe-area handling, 44px touch targets, reduced-motion support (partial: safe-area and reduced-motion done)
- [ ] Accessibility: focus order, labels, contrast, screen-reader amounts ("two thousand naira")
- [ ] PWA: manifest, icons, install prompt, offline shell

### Phase 10: Reconciliation, reversals, and merchant settlement
- [ ] Reconcile pending checkout and funding attempts against provider status; safely resolve stuck and unknown outcomes
- [ ] On payment reversal/refund, create linked ledger reversals and notify only after server confirmation
- [ ] Reconcile provider clearing and settlement accounts; unmatched funding goes to `suspense`
- [ ] Review `suspense` for mismatched amounts and unmatched accounts before attempting any forced settlement or refund
- [ ] Define merchant account mapping, settlement schedules, payout destinations, fees, and reconciliation for external merchants and Spurs products
- [ ] Track settlement lifecycle and reconcile provider clearing, merchant liabilities, and settlement accounts; unmatched funds go to `suspense`
- [ ] Confirm fees, refunds, and support handling before enabling live checkout

### Phase 11: Hardening and launch
- [ ] Security headers/CSP, CSRF checks on mutating routes, strict CORS
- [ ] Rate limits everywhere money moves; abuse signals (velocity, new-device checkout); purge old `rate_limits` windows
- [ ] Audit log for every money and security event, with actor, IP and device
- [ ] Observability: error tracking, structured logs with redaction, ledger invariant alarm (`checkInvariants`), pending-payment alarm, webhook backlog alarm (`processPendingEvents`)
- [ ] Backups and a tested restore; migration rollback plan
- [ ] Load test on checkout and funding; pen-test checklist; privacy and data-export hooks consistent with Accounts
- [ ] Runbooks: provider outage, pending/unknown payment, webhook backlog, reconciliation mismatch, suspense review, customer dispute

---

## 4. Spurs Wallet readiness (Wallet is a separate service, do not build it here)

- [x] `wallets.product` and per-product limits already in schema and config
- [x] PINs are per product
- [x] Ledger and payments modules have no Pay-specific UI or copy
- [ ] Notifications and identity modules are product-agnostic (identity is still a stub)
- [ ] Pay exposes authenticated funding-account and card/bank-transfer top-up APIs for Wallet (Phase 6b); Wallet never reads Pay's database
- [ ] Wallet remains the source of truth for its balance and PIN, and owns the Wallet customer UI
- [ ] Wallet P2P transfer code may reuse the retained transfer/recipient modules after a separate contract and security review

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

- [x] ORM: **Drizzle**
- [ ] Job runner: BullMQ vs hosted queue (interim: inline plus sweep)
- [x] Initial merchant scope: **Spurs-owned products and approved external merchants**; external merchant onboarding is managed, not self-service
- [ ] External checkout customer identity: determine whether a Spurs Account is required or guest card checkout is supported; Wallet availability follows Wallet identity/linking
- [ ] External merchant approval, API credential scopes/rotation, webhook signing and retry contract
- [ ] Wallet debit source of truth for checkout (Pay calls Wallet, or Wallet authorizes through a Pay contract)
- [ ] Wallet PIN entry and verification handoff for checkout
- [ ] Provider card form: unbranded embedded tokenization or an approved branding exception
- [ ] Checkout result delivery to Spurs products: status polling or signed internal callback
- [ ] Merchant ledger mapping, external settlement schedule, refunds and reconciliation contract
- [ ] Wallet funding API contract: funding account details, card top-up, bank-transfer top-up, and event idempotency
- [ ] Card and bank-transfer fees, limits, expiry and available-method policy
- [ ] Real payment provider vendor and credentials
- [ ] How Accounts issues service tokens for Wallet to Pay calls
- [ ] Legacy `product='pay'` wallet/funding data migration and retirement plan