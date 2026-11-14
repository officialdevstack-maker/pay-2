<!-- docs/content-guidelines.md -->
# Content guidelines

Every word a user reads follows these rules, including errors, notifications, empty states and receipts. Server messages are already written (see the error catalogue in [product-spec.md](product-spec.md)). The UI shows them as they are.

## 1. Voice

Plain, calm, specific. Written for someone in a hurry who is handling money.

- Say what happened, then what to do next.
- Short sentences. One idea each.
- No exclamation marks, no emoji, no jokes.
- Never blame the user. "The PIN is incorrect." not "You entered the wrong PIN."
- Never promise more than the system guarantees. "Usually within a few minutes" is honest. "Instant" is only for person-to-person transfers.
- Nigerian English spelling and conventions. "Naira", "bank transfer", "airtime".

## 2. Style rules

| Rule | Do | Don't |
| --- | --- | --- |
| Sentence case | Add money | Add Money |
| Verbs on buttons | Send ₦1,200.00 | Submit, OK, Continue to next step |
| Name the thing | Set your PIN | Set it up |
| Same word, same thing | "Tag" everywhere | Tag, handle, username |
| Active voice | We could not find that tag. | That tag could not be found. |
| Numerals | 5 wrong attempts | five wrong attempts |
| No filler | Add money to get started. | Welcome! Let's get you started on your journey. |
| No arrows or "→" in labels | Continue | Continue → |
| Plain punctuation | Full stops on sentences, none on labels | Ellipses for effect |
| Avoid | "Oops", "Whoops", "Uh-oh", "Seamless", "Effortless", "Supercharge" | |

## 3. Vocabulary

Pick one word and keep it.

| Use | Not |
| --- | --- |
| Send, sent | Transfer (as a verb for P2P), pay out |
| Add money | Fund, top up, deposit (in UI) |
| Spurs Pay account | Virtual account, funding account, wallet account |
| Balance | Available funds (except "Available" next to the amount) |
| Reference | Transaction ID, ref no. |
| Tag, `@tag` | Username, handle |
| PIN, transaction PIN | Passcode, password |
| Sign in, sign out | Log in, log out |
| Recipient (when formal), person's name (when possible) | Beneficiary (internal term only) |
| Receipt | Proof of payment |

Internal terms never shown to users: beneficiary, ledger, idempotency, kobo, provider, suspense, webhook, step-up.

The provider is never named, hinted at, or described. See product-spec section 11.

## 4. Amounts

- Always use `formatNaira`. The symbol is `₦`, never "NGN" or "N" in the UI.
- Show kobo. `₦1,200.00`, not `₦1,200`. The exception is `hideZeroKobo` in notification titles ("You sent ₦1,200").
- Sign: money in has `+`, money out has `−` (U+2212). Neutral amounts (balance, review) have no sign.
- Comma thousands, dot decimals.
- Buttons that move money repeat the amount: "Send ₦1,200.00".
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
| Home primary | Send money |
| Home secondary | Add money |
| Recipient step | Continue |
| Amount step | Review |
| Review | Send ₦1,200.00 |
| PIN sheet confirm | Confirm |
| Result | Done, View receipt, Share receipt |
| Receipt | Share receipt |
| Settings | Sign out |
| After an error | Try again |
| Copy rows | Copy (aria-label "Copy account number") |

Links say where they go: "Manage in Spurs Accounts", not "Click here".

## 8. Errors

Show `error.message` from the API. The UI never rewrites it and never shows a code. Extra context the UI may add comes from `details`:

| Code | Server message | Added by the UI |
| --- | --- | --- |
| `INSUFFICIENT_FUNDS` | Insufficient balance. | "You have ₦12,500.00." and an Add money link |
| `TRANSFER_LIMIT_EXCEEDED` | This transfer is above your per-transfer limit. | The limit amount from config |
| `PIN_LOCKED` | PIN attempts are temporarily locked. Try again later. | "Try again in 14 minutes." |
| `RATE_LIMITED` | Too many requests. Try again shortly. | Countdown from `retryAfterSeconds` |
| `INTERNAL` | Something went wrong on our side. Try again. | Request id in small text |

UI-only messages (not from the server):

| Situation | Copy |
| --- | --- |
| No connection | You appear to be offline. |
| Timeout | We couldn't reach Spurs Pay. |
| Unknown outcome | Confirming your transfer. This can take a moment. |
| Still unknown after retries | We are still checking. You can leave this screen and check Activity. |

Error placement: inline beside the field it belongs to, `role="alert"`. A toast is never the only place an error appears.

## 9. Empty states

One sentence that says what belongs here and what to do.

| Screen | Copy |
| --- | --- |
| Home activity | No activity yet. Add money to get started. |
| Activity (All) | No activity yet. |
| Activity (Sent) | You have not sent any money yet. |
| Activity (Received) | You have not received any money yet. |
| Activity (Added money) | You have not added any money yet. |
| Recent people | Hidden when empty |
| Search no match | No one matches "ada". |

## 10. Notifications

Titles are the fact. Bodies are the context. Created by `notifyTransfer` and the funding handler.

| Type | Title | Body |
| --- | --- | --- |
| `transfer.sent` | You sent ₦1,200 | To Ada Okafor |
| `transfer.received` | You received ₦1,200 | From Tunde Bello |
| `funding.received` | ₦12,500 added to your balance | Bank transfer received |
| Fallback name | | From a Spurs Pay user |

Rules: no emoji, no "Great news", no exclamation marks. Always carry the `SPY_` reference. Email subjects use the title text.

## 11. Setup and onboarding

| Step | Copy |
| --- | --- |
| Checklist heading | Finish setting up |
| Email | Verify your email |
| Tag | Choose your @tag |
| PIN | Set your transaction PIN |
| Why before sending | Set up your tag and PIN to send money. |
| Tag permanence | Your tag is permanent. Check it is right. |
| Step-up | Confirm it is you to change your PIN. |

## 12. Accessibility copy

- Every icon-only button has an `aria-label` in the same vocabulary ("Hide balance", "Delete last digit", "Close").
- Link and button text makes sense alone.
- Status changes announce through `aria-live`: "PIN is incorrect", "Copied", "Transfer confirmed".
- Form labels are visible text, never placeholder only.
- Language attribute is `en-NG` (already set in `layout.tsx`).

## 13. Review checklist for copy

Before merging text, check:

1. Does it say what happened and what to do?
2. Is every term from section 3, with no internal terms?
3. Do amounts follow section 4?
4. Could a stranger understand it without the screen around it?
5. Is there a provider name, hint or raw provider string anywhere? (`npm run check:leaks`)
