<!-- docs/content-guidelines.md -->
# Content guidelines

Every word a user reads follows these rules, including errors, notifications, empty states and receipts. Existing server messages are in the error catalogue in [product-spec.md](product-spec.md); checkout-specific codes and messages must be defined before the checkout UI is built. The UI shows server messages as they are.

This guide covers Pay checkout and payment-method screens. Legacy P2P copy in retained transfer code is not Pay UI copy; review it separately before Wallet reuses it.

## 1. Voice

Plain, calm, specific. Written for someone in a hurry who is handling money.

- Say what happened, then what to do next.
- Short sentences. One idea each.
- No exclamation marks, no emoji, no jokes.
- Never blame the user. "This payment method isn't available." not "You chose an invalid method."
- Never promise more than the system guarantees. "Usually within a few minutes" is honest. A payment is complete only after the server confirms it.
- Nigerian English spelling and conventions. "Naira", "bank transfer".

## 2. Style rules

| Rule | Do | Don't |
| --- | --- | --- |
| Sentence case | Add money | Add Money |
| Verbs on buttons | Pay ₦12,500.00 | Submit, OK, Continue to next step |
| Name the thing | Add payment method | Set it up |
| Same word, same thing | Payment method everywhere | Source, instrument |
| Active voice | We could not complete the payment. | The payment could not be completed. |
| Numerals | 5 wrong attempts | five wrong attempts |
| No filler | No payments yet. | Welcome! Let's get you started on your journey. |
| No arrows or "→" in labels | Continue | Continue → |
| Plain punctuation | Full stops on sentences, none on labels | Ellipses for effect |
| Avoid | "Oops", "Whoops", "Uh-oh", "Seamless", "Effortless", "Supercharge" | |

## 3. Vocabulary

Pick one word and keep it.

| Use | Not |
| --- | --- |
| Payment, paid | Transfer (for a checkout payment), transaction (in customer copy) |
| Payment method | Source, instrument |
| Spurs Wallet | Pay wallet, Pay balance |
| Bank transfer | Deposit, bank funding account |
| Card •••• 5438 | Full card number, PAN |
| Payment reference | Transaction ID, ref no. |
| Sign in, sign out | Log in, log out |
| Receipt | Proof of payment |

Use "Add money" only in the Wallet customer experience. Pay's payment methods and checkout do not expose an Add money screen.

Internal terms never shown to users: ledger, idempotency, kobo, provider, suspense, webhook, step-up, merchant account.

The provider is never named, hinted at, or described. See product-spec section 11.

## 4. Amounts

- Always use `formatNaira`. The symbol is `₦`, never "NGN" or "N" in the UI.
- Show kobo. `₦1,200.00`, not `₦1,200`. The exception is `hideZeroKobo` in notification titles ("Payment of ₦1,200 confirmed").
- Sign: money in has `+`, money out has `−` (U+2212). Neutral checkout amounts have no sign.
- Comma thousands, dot decimals.
- Checkout confirmation repeats the amount: "Pay ₦12,500.00".
- Never write an amount in a sentence without the symbol.

## 5. Spoken amounts (screen readers)

`AmountDisplay` sets an `aria-label` in words so the screen reader does not read symbols.

| Visible | Spoken |
| --- | --- |
| ₦1,250.50 | 1,250 naira 50 kobo |
| ₦850.00 | 850 naira |
| +₦3,000.00 | plus 3,000 naira |
| −₦850.00 | minus 850 naira |
| ₦0.00 | zero naira |

Implementation: `src/lib/money.ts` gets `spokenNaira(kobo, { sign })`, covered by a test next to `money.test.ts`.

## 6. Dates and times

- Time zone: Africa/Lagos always, formatted with `Intl.DateTimeFormat('en-NG', { timeZone: 'Africa/Lagos' })`.
- Lists: "2:14 PM". Day groups: "Today", "Yesterday", then "Mon 10 Nov", then "10 Nov 2025" for another year.
- Receipts: "14 Nov 2026, 2:14 PM".
- Relative time only for under a day ("5 minutes ago"), and only where the exact time is also reachable.
- Lock expiry: "Try again in 14 minutes." Round up, minimum "1 minute".

## 7. Buttons and links

| Place | Label |
| --- | --- |
| Home primary | Add payment method |
| Payment methods | Add card |
| Checkout method | Pay by bank transfer |
| Checkout confirm | Pay ₦12,500.00 |
| Payment result | Done, View receipt, Return to Spurs Store |
| Bank transfer details | Send exactly |
| Receipt | Share receipt |
| Settings | Sign out |
| After an error | Try again |
| Copy reference | Copy (aria-label "Copy payment reference") |

Links say where they go: "Manage in Spurs Accounts", not "Click here".

## 8. Errors

Show `error.message` from the API. The UI never rewrites it and never shows a code. Extra context the UI may add comes from `details`:

| Code | Server message | Added by the UI |
| --- | --- | --- |
| `INSUFFICIENT_FUNDS` | Insufficient balance. | Offer another eligible payment method; do not link to Pay Add money |
| Checkout session expired | Contract code/message to define | Explain that checkout expired and provide a safe return to the requesting Spurs product |
| Payment method unavailable | Contract code/message to define | Offer another eligible method |
| Card authentication/decline | Provider-neutral mapped message | Offer a safe retry or another method |
| `RATE_LIMITED` | Too many requests. Try again shortly. | Countdown from `retryAfterSeconds` |
| `INTERNAL` | Something went wrong on our side. Try again. | Request id in small text |

UI-only messages (not from the server):

| Situation | Copy |
| --- | --- |
| No connection | You appear to be offline. |
| Timeout | We couldn't confirm this payment yet. |
| Unknown outcome | We couldn't confirm this payment yet. |
| No payment method available for this payment yet | No payment method is available for this payment yet. |
| Waiting for your transfer | Waiting for your transfer. We will confirm it here once it arrives, usually within a few minutes. You can leave this page and check Activity. |
| Still unknown after retries | We are still checking. You can leave this screen and check Activity. |

Error placement: inline beside the field it belongs to, `role="alert"`. A toast is never the only place an error appears.

## 9. Empty states

One sentence that says what belongs here and what to do.

| Screen | Copy |
| --- | --- |
| Home payments | No payments yet. |
| Activity | No payments yet. |
| Payment methods | No payment methods yet. |

## 10. Notifications

Titles are the fact. Bodies are the context. Pay notifications are created from server-confirmed checkout state.

| Type | Title | Body |
| --- | --- | --- |
| Payment completed | Payment of ₦12,500 confirmed | Spurs Store |
| Payment reversed | Payment of ₦12,500 reversed | Spurs Store |

Rules: no emoji, no "Great news", no exclamation marks. Carry our `SPY_` reference in the receipt. Wallet funding notifications belong to Wallet. Email subjects use the title text.

## 11. Setup and onboarding

| Step | Copy |
| --- | --- |
| Checklist heading | Finish setting up |
| Email | Verify your email |
| Payment methods | Add payment method |

Do not show Pay tag or PIN setup. Wallet owns Wallet PIN setup, recovery, and funding copy.

## 12. Accessibility copy

- Every icon-only button has an `aria-label` in the same vocabulary ("Close", "Copy payment reference").
- Link and button text makes sense alone.
- Status changes announce through `aria-live`: "Copied", "Payment confirmed".
- Form labels are visible text, never placeholder only.
- Language attribute is `en-NG` (already set in `layout.tsx`).

## 13. Review checklist for copy

Before merging text, check:

1. Does it say what happened and what to do?
2. Is every term from section 3, with no internal terms?
3. Do amounts follow section 4?
4. Could a stranger understand it without the screen around it?
5. Is there a provider name, hint or raw provider string anywhere? (`npm run check:leaks`)
