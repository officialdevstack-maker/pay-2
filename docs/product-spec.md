# Spurs Pay: product spec

Status: product direction set for Spurs first-party and approved external merchant checkout. Wallet debit ownership, PIN entry, merchant onboarding controls, and card-form provider treatment remain open decisions.

## 1. What Spurs Pay is

Spurs Pay is the payment-methods and hosted-checkout service for Spurs-owned products and approved outside merchants. A customer can pay with a Spurs Wallet balance, a saved card, or bank transfer. Pay creates and tracks payments for the merchant that requested checkout.

Spurs Wallet is a separate service. It owns Wallet balances, its user interface, and its PIN. Pay does not hold or display a customer balance of its own. Wallet uses Pay's authenticated service API to initiate card or bank-transfer funding into the Wallet product.

The first release serves Spurs products and approved external merchants. Spurs products use a private authenticated integration; external merchants use managed onboarding, scoped API credentials, signed payment webhooks, and settlement to their merchant accounts. Self-service merchant onboarding is not required for v1.

## 2. Who it is for

| Person | Situation | What they need from the app |
| --- | --- | --- |
| **Customer** | Pays for a Spurs product on a phone or desktop | Recognise the product and amount, choose a payment method, and know the final outcome |
| **Wallet customer** | Adds funds to Spurs Wallet from the Wallet service | Funding instructions and a confirmed result in Wallet; Pay supplies the payment service behind the flow |
| **Spurs product team** | Starts a purchase for a customer | A private, authenticated checkout contract and a reliable final payment status |
| **External merchant** | Integrates checkout for its customers | Secure API credentials, clear integration guidance, signed payment notifications, and predictable settlement |

Primary device: mid-range Android over variable mobile data. Secondary: desktop browser. Design and test for that order.

## 3. Product principles

1. **Money is never ambiguous.** Every amount shows currency and exact kobo where it matters. The customer sees the merchant and amount before authorising.
2. **Fewer decisions.** One primary action per screen. Defaults are right most of the time.
3. **Honest state.** A payment is not successful until the server confirms it. An unknown outcome stays pending while Pay checks the same idempotent attempt.
4. **Errors are directions.** Each error says what happened and what to do next.
5. **Security that people can see.** Authentication, Wallet authorisation, and card authentication are explicit parts of checkout.
6. **Spurs, not a vendor.** The customer never learns which payment provider is underneath (section 11).
7. **One balance owner.** Spurs Wallet owns Wallet balances. Pay must not create a second customer balance or debit Wallet funds outside the agreed Wallet authorization contract.

## 4. Scope for v1

### In

- Sign in and out with Spurs Accounts
- Home with a payment-method summary and recent payments
- Payment methods: Spurs Wallet availability, tokenized saved cards, and bank transfer
- Hosted checkout sessions launched by Spurs-owned products
- Hosted checkout sessions launched by approved external merchants
- Managed external merchant onboarding, scoped API credentials, signed payment webhooks, and settlement
- Payment status and receipt for completed, pending, failed, or reversed checkout attempts
- Activity for payments made through Pay
- Settings for Spurs account details, appearance, security information, and sign out
- Authenticated service API used by Spurs Wallet to initiate and reconcile card or bank-transfer funding for the Wallet product

### Out for v1

- Self-service merchant onboarding or a merchant dashboard
- A Pay-owned customer balance, Pay wallet PIN, or Pay top-up screen
- Add money UI in Pay; Wallet owns its funding experience
- P2P transfer, recipient search, `@tag`, request money, QR, and pay links in Pay's UI
- Withdrawals or bank payouts from a Pay-owned customer balance
- Airtime and data

Existing transfer, recipient, and Pay-product wallet code is retained for reuse or migration. Its presence does not make those flows part of the Pay customer experience. Do not add them to Pay navigation or build new P2P UI here.

Rule: **do not show disabled buttons for unbuilt features.** Hide a feature until its route and service contract work.

## 5. Information architecture

```
Home                    /
Payment methods         /payment-methods
Activity                /activity
  Payment detail        /activity/[reference]
Settings                /settings
Hosted checkout         /checkout/[id]
```

The app navigation contains Home, Payment methods, Activity, and Settings. A tab appears only when its route exists. Checkout is opened by an authorized Spurs product or approved external merchant and is not a navigation tab. There is no `/add-money` or P2P `/pay` route in the Pay UI.

Auth routes (`/auth/*`, `/signed-out`) are outside the app shell and stay minimal. Wallet funding starts in Wallet and calls Pay's service API; it does not navigate to a Pay add-money page.

## 6. Core flows

### 6.1 Sign-in and setup

1. The customer app uses Spurs Accounts and maps the Accounts subject to its customer record. Whether an external merchant's checkout requires a Spurs Account or supports guest card checkout remains open in section 13.
2. Pay must not create a `product='pay'` user wallet as part of the new product model. Existing Pay-product wallets are legacy data and need a migration/retirement plan before their code or records are removed.
3. Home shows only actionable setup requirements that are relevant to checkout. Email verification may be required by policy. Do not ask for a Pay `@tag` or Pay PIN.
4. Wallet linking and authorisation depend on the open Wallet integration decisions in section 13. Do not show a fake linked/ready state.

### 6.2 Home

1. Show the payment-method summary: Spurs Wallet, saved cards (network and last four only), and bank transfer.
2. The single primary action is **Add payment method**. The card opens `/payment-methods`.
3. Show recent Pay checkout transactions with a **See all** link to Activity.
4. Do not show a Pay balance, hide-balance toggle, People grid, Send money, or Add money action.

### 6.3 Payment methods

- Spurs Wallet is an external payment source owned by the Wallet service; Pay may show its availability and, if approved by the Wallet contract, a current balance returned by Wallet. Pay never stores that balance as its own.
- Saved cards are represented by provider tokens and safe display metadata (for example, network and last four). Never store or return PAN, CVV, or raw authentication data.
- Bank transfer is a payment option, not a saved bank account. Show transfer instructions only for an active checkout or Wallet funding request.
- Adding/removing a card requires explicit confirmation, secure tokenization, and clear success or failure state. Provider-specific UI treatment is subject to section 13.

### 6.4 Hosted checkout

```
Spurs product or approved merchant → authenticated checkout session → customer chooses method
    → Wallet authorization | tokenized card payment | bank transfer
    → server-confirmed result → merchant reads final status or receives a signed webhook
```

- Only a registered Spurs product or approved external merchant can create a checkout session. Spurs products use a private authenticated integration. External merchants use scoped, revocable API credentials; secrets are shown only at creation and never logged or returned in checkout responses.
- A session contains its merchant identity, amount, currency, reference, status, expiry, and selected method where applicable. The server validates the merchant and amount; never trust a client-supplied success, merchant identity, or price.
- `/checkout/[id]` shows the verified merchant name, amount, and available methods. The customer confirms the payment before money moves.
- The first authenticated customer to open a session is bound to it; later customers cannot take it over. Each session has at most one active payment attempt, and an unknown attempt must be resolved before another method can start.
- Checkout sessions currently expire after 30 minutes for all methods, including bank transfer. Revisit the transfer window before enabling longer-lived external checkout.
- Wallet authorization must use the Wallet service as the source of truth for Wallet funds. Pay and Wallet must agree on one atomic, idempotent debit/authorization path before Wallet checkout is implemented.
- Card data is entered only through an approved tokenized/embedded provider flow. Pay must not receive raw card credentials. The provider-brand conflict must be resolved before shipping the card form.
- Bank transfer shows the account details associated with the checkout and remains pending until a verified event confirms payment. A timeout is not a decline.
- A completed payment posts a balanced `payment` transaction to the merchant's ledger account. Retries reuse the same idempotency key. Corrections use linked reversal entries, never edits.
- The merchant reads or receives the server-confirmed final status. External webhook delivery is signed, retried idempotently, and does not change payment state if delivery fails. The internal Spurs product delivery contract is also retryable.
- Settlement moves only reconciled merchant funds to the merchant's configured destination, with an auditable ledger trail and clear pending/paid/failed status.

### 6.5 Wallet funding through Pay

1. The customer starts funding in the Wallet UI.
2. Wallet authenticates to Pay's service API and requests funding-account details or a card top-up for its server-mapped `wallet` product.
3. Pay initiates the provider operation and processes verified provider events idempotently.
4. Pay credits Wallet only through the agreed Wallet service contract. Wallet remains the source of truth for its balance and presents the funding status to the customer.
5. Pay has no customer-facing Add money route. Wallet funding activity belongs in Wallet's activity unless an explicit product decision says otherwise.

### 6.6 Activity and payment detail

- Activity lists Pay checkout payments, newest first, with status, merchant, amount, and time in Africa/Lagos.
- A payment detail/receipt shows the merchant, amount, payment method summary, status, date/time, and our `SPY_` reference.
- Wallet top-ups and P2P transfers are not mislabeled as Pay checkout payments.
- Provider references and raw provider descriptions are never shown.

### 6.7 Settings

- Name and email come from Spurs Accounts and are read-only here, with a link to manage them in Accounts.
- Appearance and sign out live in Settings.
- Wallet owns Wallet PIN setup and recovery. Pay must not offer a Pay PIN setting. The authorization handoff for a Wallet checkout remains open.

## 7. Business rules the UI must respect

| Rule | Value | Source |
| --- | --- | --- |
| Currency | NGN for the initial release | ledger |
| Storage | integer kobo | `src/lib/money.ts` |
| Checkout amount | Server supplied by an authenticated/credentialed merchant; immutable after session creation | Checkout contract to define |
| Merchant | Spurs-owned products and approved external merchants | Product decision, 2026-11-16 |
| Payment methods | Wallet, tokenized card, bank transfer | Checkout contract |
| Payment status | Server-confirmed; pending remains pending until reconciled | Checkout state machine to define |
| Idempotency | Required for session creation and every money-changing attempt | Existing ledger idempotency; checkout API to define |
| Wallet balance and PIN | Owned by Spurs Wallet | Wallet service contract |
| Card data | Token only in Pay; no raw PAN/CVV in Pay storage or logs | Provider integration and security review |
| Reference | Our `SPY_` format; never the provider reference | `src/lib/ids.ts` |

Do not hard-code amount, status, fee, or method availability in components. Read them from the authenticated session/API contract. Existing P2P limits and tag rules apply only to retained transfer functionality, not to checkout.

## 8. Checkout errors and outcomes

The checkout contract must define stable `AppError` codes before the UI is built. Reuse shared errors where their meaning matches; do not reuse P2P-specific recipient or transfer errors for checkout.

| Outcome | Treatment |
| --- | --- |
| Invalid, unknown, or expired session | Explain that checkout is no longer available; provide a safe return to the requesting Spurs product |
| `CHECKOUT_NOT_FOUND` | Show a safe not-found state and return the merchant to its configured URL. |
| `MERCHANT_NOT_FOUND` | Treat as a forbidden checkout client; do not expose the internal lookup path. |
| `MERCHANT_UNAVAILABLE` | Explain the merchant cannot take payments right now and keep the customer on a safe return path. |
| `CHECKOUT_UNAVAILABLE` | Explain that this checkout is no longer available and offer a safe return to the merchant. |
| `CHECKOUT_CANCELLED` | Explain that the checkout was cancelled and offer a return to the merchant. |
| Wallet unavailable or insufficient | Do not debit; offer another available payment method |
| Card authentication/decline | Show a plain, provider-neutral explanation and allow a safe retry or another method |
| Bank transfer awaiting confirmation | Show the transfer instructions and pending state; do not claim success |
| Provider/network timeout | Show "We couldn't confirm this payment yet." Keep the same attempt and check status; do not offer a duplicate payment |
| Replayed request | Return the original result for the same key |
| Idempotency mismatch | Treat as a bug; do not make a second payment |
| Suspended or unverified account | Explain the restriction and the action needed before checkout |
| Unknown internal error | Show a request identifier and retry only when the outcome is safe to retry |

## 9. States every screen must handle

| State | Requirement |
| --- | --- |
| Loading | Skeleton that matches the final layout. No spinners on full pages |
| Empty | Says what belongs here and offers the next valid action |
| Error | Uses the checkout/API error catalogue, with a safe retry where possible |
| Offline | Keep safe cached information visible; do not claim a payment failed or succeeded |
| Pending | Explain what is being confirmed and prevent a duplicate payment |
| Blocked | Explain suspension, account verification, or unavailable method and offer the fix |
| Success | One clear server-confirmed receipt, then a return to the Spurs product |

## 10. Security and trust in the experience

- Checkout sessions are created only by authenticated Spurs products or approved external merchants with scoped credentials. The customer cannot change merchant identity, amount, or currency in the browser.
- External merchant credentials are scoped, revocable, rotated safely, and never exposed to customer-facing clients. Webhook secrets and payment events are verified, replay-protected, and redacted from logs.
- Bind checkout access to the intended customer/session and expire it. Avoid putting credentials or payment secrets in URLs.
- The Wallet service owns Wallet balance and PIN verification. Pay must not read Wallet's database or collect a Wallet PIN until the agreed authorization design explicitly requires a safe, scoped handoff.
- Card entry uses tokenization/hosted fields approved for the integration. Raw PAN/CVV must not enter Pay APIs, logs, analytics, or storage.
- The server is the sole authority for payment status. The browser never posts a success state.
- Every money mutation is idempotent. Verify provider events, deduplicate them, and reconcile unknown outcomes.
- Receipts use our `SPY_` reference. Never expose provider references.

## 11. Provider secrecy in the UI

The payment provider must never be visible. For the UI that means:

- No provider logos, colours, names or URLs in any asset, page title, alt text, error, receipt or email.
- Card UI must use tokenized/embedded fields that do not expose provider branding, or a deliberate documented exception must be approved before release.
- Bank/account names returned by a provider are shown only after a check that they do not contain a vendor brand.
- Error messages are ours. Raw provider text never reaches the screen.
- `npm run check:leaks` must pass after every UI change.

## 12. How we will know it works

Track these once analytics exist. Aim for direction, not vanity.

- Checkout completion rate: session opened → server-confirmed success
- Payment-method selection and completion rate, by method
- Pending/unknown-outcome rate and time to final resolution
- Duplicate-payment and reversal rate
- Wallet funding completion rate, measured by Wallet's own user experience
- Support contacts about "where is my payment" or "where is my money"

## 13. Open decisions that affect the UI and architecture

| Decision | Why it matters |
| --- | --- |
| Wallet debit source of truth: Pay calls Wallet, or Wallet authorizes/debits through a Pay contract | Prevents double-spend and determines checkout authorization, idempotency, and ledger ownership |
| Wallet PIN entry and verification handoff | Wallet owns the PIN; checkout cannot collect or verify it by assumption |
| External checkout customer identity: Spurs Account required or guest card checkout | Determines account creation, saved-card access, Wallet availability, and checkout session binding |
| Provider card form: unbranded embedded tokenization or an approved branding exception | Determines whether the card method can satisfy provider secrecy |
| Checkout result delivery for external merchants: signed webhook/callback details | Stage 1 uses authenticated status polling; external merchants need trusted, retryable delivery without duplicate side effects |
| External merchant onboarding, due diligence, credential lifecycle and webhook configuration | External access must be approved, scoped, revocable, and supportable |
| Merchant account mapping, settlement schedule, fees, refunds and reconciliation | Every merchant needs balanced postings and auditable, predictable payouts |
| Funding-account and card top-up API contract for Wallet | Defines product mapping, authorization, idempotency, and how provider events credit Wallet |
| Real provider, fee schedule, limits, and any change to the 30-minute payment expiry | These affect eligibility, copy, and pending states |
