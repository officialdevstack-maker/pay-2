<!-- docs/screens.md -->
# Screens

Wireframes, content and states for each route. Components are named as in [design-system.md](design-system.md). Copy follows [content-guidelines.md](content-guidelines.md). Rules and error handling come from [product-spec.md](product-spec.md).

Wireframes are structure, not pixels. Sample payment data uses real-looking NGN amounts and Spurs product names; never display provider sample data as if it were live.

Every screen handles loading, empty, error, offline, pending, blocked and success where they apply (product-spec section 9).

## Shell

```
Mobile                                  Desktop (768+)
┌──────────────────────────┐            ┌────────┬─────────────────────┐
│ Spurs Pay                │            │ Spurs  │                     │
├──────────────────────────┤            │ Pay    │   content (560)     │
│                          │            │        │                     │
│ content                  │            │ Home   │                     │
│                          │            │ Payment│                     │
│                          │            │ Activity                     │
├──────────────────────────┤            │ Settings                    │
│Home Methods Activity Set │            └────────┴─────────────────────┘
└──────────────────────────┘
```

Rules: navigation contains only built routes. The "Verify your email" banner sits below the mobile header while email verification is required. Checkout is opened by a first-party Spurs product, not from the navigation.

## 1. Home `/`

```
┌──────────────────────────┐
│ Finish setting up        │  ← only for real, actionable requirements
│ Verify your email        │
├──────────────────────────┤
│ Payment methods          │
│ ┌──────────────────────┐ │
│ │ Spurs Wallet   Ready │ │
│ │ Card •••• 5438       │ │
│ │ Bank transfer        │ │
│ │ [Add payment method] │ │  ← primary
│ └──────────────────────┘ │
├──────────────────────────┤
│ Recent payments  See all │
│ ┌──────────────────────┐ │
│ │ Spurs Store   −₦850  │ │
│ │ Paid · 2:14 PM       │ │
│ └──────────────────────┘ │
└──────────────────────────┘
```

Content:

- The payment-method summary comes from the payment-method service, not mock state. A Wallet balance may appear only if the Wallet API explicitly returns it under the agreed contract.
- `Add payment method` opens `/payment-methods`. Do not show Search, People, Send money, Add money, or a customer balance.
- Setup shows only real checkout prerequisites. Do not ask for a Pay `@tag` or Pay PIN.
- Recent payments shows the latest five checkout transactions. `See all` opens Activity.

States:

| State | Treatment |
| --- | --- |
| Loading | Method-summary and payment-list skeletons |
| No saved methods | Explain that a method can be added; keep the payment-method action visible |
| Empty payments | "No payments yet." with an Add payment method action |
| Offline | Show only safe cached method/payment details; do not imply a payment succeeded |
| Account blocked | Explain the restriction and the action needed before checkout |

Dependencies: profile/verification state, payment-method service, checkout activity.

## 2. Payment methods `/payment-methods`

```
┌──────────────────────────┐
│ Payment methods          │
│                          │
│ Spurs Wallet             │
│ Connected                │
├──────────────────────────┤
│ Cards                    │
│ Visa •••• 5438            │
│                          │
│ Bank transfer            │
│ Available at checkout    │
│                          │
│ [ Add payment method ]   │
└──────────────────────────┘
```

- Show Spurs Wallet as a Wallet-owned source; show no Pay-owned balance.
- Cards display only card network, last four digits, and a safe expiry summary where needed. Never display or store PAN/CVV.
- Bank transfer is offered per checkout or Wallet funding request; it is not a saved bank account.
- Add/remove card actions use provider tokenization, clear confirmation, and provider-neutral errors. Provider form branding is blocked on the open decision in product-spec section 13.
- If Wallet is unavailable, state that plainly and offer another eligible method. Do not claim the Wallet is connected based on a client flag.

## 3. Hosted checkout `/checkout/[id]`

```
┌──────────────────────────┐
│ Spurs Store              │
│ Payment                  │
│                          │
│ Amount                   │
│ ₦12,500.00               │
│ Reference SPY_8K2M…      │
│                          │
│ Choose a payment method  │
│ ○ Spurs Wallet           │
│ ○ Visa •••• 5438         │
│ ○ Bank transfer          │
│                          │
│ [ Pay ₦12,500.00 ]       │
└──────────────────────────┘
```

- Merchant/product identity, amount, and currency are server-owned and read-only. Checkout accepts sessions from Spurs-owned products only.
- List only methods eligible for this session. Wallet available funds may be shown only from Wallet's authoritative response.
- Wallet: invoke the agreed Wallet authorization/debit contract. PIN ownership and entry are unresolved; do not implement a Pay-owned PIN.
- Card: collect credentials only through approved tokenized/embedded fields. Do not submit raw card data to Pay.
- Bank transfer: show the session's account details and an explicit pending state. Confirm only after a verified provider event.
- Prevent duplicate submit. Retries reuse the same idempotency key and check the same attempt.

States:

| State | Treatment |
| --- | --- |
| Loading | Checkout summary and method skeletons |
| Expired or invalid session | Explain that checkout is unavailable and provide a safe return to the Spurs product |
| Wallet unavailable/insufficient | Do not debit; offer another eligible method |
| Card authentication/decline | Provider-neutral explanation; offer safe retry or another method |
| Bank transfer pending | Keep instructions and explain that confirmation is pending |
| Unknown outcome | "We couldn't confirm this payment yet." Check the existing attempt; never start a second payment |
| Success | Show a confirmed receipt summary and return to the requesting Spurs product |
| Failure | Show the mapped reason and retain a safe route back to the product |

## 4. Activity `/activity`

```
┌──────────────────────────┐
│ Activity                 │
│                          │
│ Today                    │
│ Spurs Store     −₦850   │
│ Paid · 2:14 PM           │
│                          │
│ Yesterday                │
│ Spurs Tickets  −₦12,500 │
│ Paid · 6:20 PM           │
└──────────────────────────┘
```

- List Pay checkout payments, newest first, grouped by Africa/Lagos day.
- Rows show the Spurs product, amount, status, and time. Selecting a row opens `/activity/[reference]`.
- Do not include Wallet top-ups or retained P2P transfers as Pay checkout transactions.
- Pagination and filters follow the activity API contract; never display provider references.

## 5. Payment detail `/activity/[reference]`

```
┌──────────────────────────┐
│ ‹ Activity               │
│ Payment                  │
│                          │
│ Paid                     │
│ −₦12,500.00              │
│ Spurs Tickets            │
│                          │
│ Method   Visa •••• 5438  │
│ Date     16 Nov 2026     │
│ Time     2:14 PM         │
│ Ref      SPY_8K2M…  Copy │
└──────────────────────────┘
```

- Show server-confirmed status, product, amount, safe payment-method summary, date/time in Africa/Lagos, and our `SPY_` reference.
- Pending payments remain visibly pending. Reversals link to the original payment where possible.
- Unknown references return not found. Never expose a provider reference or raw provider message.

## 6. Settings `/settings`

```
┌──────────────────────────┐
│ Settings                 │
│ ┌──────────────────────┐ │
│ │ Name from Accounts   │ │
│ │ email@example.com    │ │
│ ├──────────────────────┤ │
│ │ Manage in Accounts   │ │
│ │ Appearance           │ │
│ └──────────────────────┘ │
│ [ Sign out ]             │
└──────────────────────────┘
```

- Name and email are read-only and managed in Spurs Accounts.
- Appearance offers System, Light, and Dark.
- Sign out is a form POST to `/auth/logout`.
- Wallet PIN setup, change, and recovery belong to Wallet. Do not add a Pay PIN setting.

## 7. Signed out `/signed-out`

Minimal, outside the shell. Wordmark, one heading, one sentence, one link.

- Signed out: "You're signed out" and "Sign in again".
- Sign-in failed (`?error=signin`): "We could not sign you in", "The sign-in was cancelled or expired. Try again." and "Sign in again".

## 8. Blocked states

Full-screen state for suspended accounts or a required verification step that prevents checkout. Explain the issue and provide the relevant Accounts/support action. Do not show active payment actions while blocked.

## 9. Offline and network failure

- No connection: show "You appear to be offline." Safe cached method and activity details may remain visible. Do not claim a payment failed or succeeded.
- Timeout: show "We couldn't confirm this payment yet." Retry/status checks must use the same session and idempotency key. Never create a duplicate payment just because the response was lost.
