# Spurs Pay: product spec

Status: draft for Phase 9. Numbers marked **placeholder** are not approved policy.

## 1. What Spurs Pay is

Spurs Pay is a mobile-first wallet for people in Nigeria. You add money from any bank app, then send it to other Spurs users by `@tag` in a few taps. It signs in with a Spurs account, so there is no separate password to manage.

It is built to be calm and trustworthy. People use it to move money, so the interface should never feel clever, busy or unsure.

## 2. Who it is for

| Person | Situation | What they need from the app |
| --- | --- | --- |
| **Everyday sender** | Splits a bill, pays a friend, sends money to family. Uses it several times a week, mostly on a phone | Send in under 15 seconds. Recent people at the top. No surprises on amount or fee |
| **First-time user** | Just signed in with a Spurs account. Has no tag, no PIN, no balance | A short, clear path to being ready to send. No jargon, no wall of setup |
| **Receiver** | Gets a notification that money arrived | Confirmation of who sent it and how much. A receipt they can open later |

Primary device: mid-range Android over variable mobile data. Secondary: desktop browser. Design and test for that order.

## 3. Product principles

1. **Money is never ambiguous.** Every amount shows currency, sign and the exact kobo when it matters. Every action says what it will do before it does it.
2. **Fewer decisions.** One primary action per screen. Defaults are right most of the time.
3. **Honest state.** If we are unsure whether a transfer went through, we say so, then check. We never show success early and never show failure when the outcome is unknown.
4. **Errors are directions.** Each error says what happened and what to do next.
5. **Security that people can see.** The PIN sheet, the verified-email banner and the step-up prompt are part of the experience, not hidden in settings.
6. **Spurs, not a vendor.** The user never learns which payment provider is underneath (section 11).

## 4. Scope for v1

### In

- Sign in and out with Spurs Accounts
- Setup: verify email (done in Accounts), choose `@tag`, set transaction PIN
- Add money by bank transfer to a personal "Spurs Pay account"
- Send money to another user by `@tag`, with an optional note
- Recent people, search by tag or name
- Activity list, receipts with a `SPY_` reference
- In-app notifications for money sent and received
- Settings: tag (read-only once set), change PIN, appearance, sign out

### Out for v1 (do not design around them, and do not show them)

- Card funding (deferred in `todo.md`)
- Withdrawals to bank (Phase 10)
- Request money, QR, pay links (Phase 11)
- Airtime and data (Phase 12)
- Spurs Wallet screens (separate service)

Rule: **do not show disabled buttons for unbuilt features.** A greyed "Request" and "Scan" make the app look unfinished. Hide them behind a flag and ship them when they work.

## 5. Information architecture

```
Home                    /
Pay (send flow)         /pay
Activity                /activity
  Receipt               /activity/[reference]
Add money               /add-money
Settings                /settings
  Tag                   /settings/tag
  Transaction PIN       /settings/pin
```

Navigation has up to four tabs: Home, Pay, Activity, Settings. A tab appears only when its route exists. Add money is reached from Home, not from the tab bar.

Auth routes (`/auth/*`, `/signed-out`) are outside the app shell and stay minimal.

## 6. Core flows

### 6.1 First sign-in and setup

1. User signs in through Spurs Accounts. We create their Pay user and wallet (`ensureWallet`).
2. Home shows a **setup checklist** until complete. It is a small block on Home, not a blocking modal.
   - Verify your email (only if `emailVerified` is false). Link out to Spurs Accounts.
   - Choose your `@tag`
   - Set your transaction PIN
3. Sending is blocked until all three are done. The Send button stays visible and, when pressed, takes the user to the first missing step with a one-line reason.

Choosing a tag is permanent (`TAG_ALREADY_SET`). The confirmation step must say so before saving.

### 6.2 Add money

1. Home → Add money.
2. Screen shows the user's **Spurs Pay account**: account name, account number, bank name. Each has a copy action.
3. One sentence of guidance: transfer from any bank app, and the balance updates when the transfer arrives.
4. The balance changes only after the webhook is processed. No optimistic credit.
5. A credited deposit appears in Activity as "Added money" with the sender name if known.

### 6.3 Send money

```
Recipient → Amount (+ note) → Review → PIN → Result
```

Rules that shape the UI:

- **Recipient.** Lookup by `@tag` (`GET /api/recipients/lookup`). Show name and tag only, never email or phone. Recent people come from `GET /api/recipients/recent` with search.
- **Lookup is rate limited** (30 per minute per user). Do not look up on every keystroke. Look up when the entered tag is valid in shape and the user pauses, or on submit.
- **Amount.** Naira with up to two decimals, parsed to kobo by `parseNairaToKobo`. Must be above ₦0. Show available balance under the amount.
- **Note.** Optional, 100 characters max, control characters stripped.
- **Review.** Shows recipient, amount, fee ("No fee" for person-to-person), note. The primary button repeats the amount: "Send ₦1,200.00".
- **PIN.** 4 to 6 digits, entered in a sheet over the review screen. Five wrong attempts lock the PIN for 15 minutes.
- **Idempotency.** The client generates an `Idempotency-Key` when the user reaches Review and reuses it for every retry of the same transfer. If recipient, amount or note change, it generates a new key. A response with status 200 (replayed) is treated as success and shows the same receipt.
- **Double tap.** The confirm button disables and shows progress the moment it is pressed.
- **Unknown outcome.** On network timeout or `IDEMPOTENCY_IN_PROGRESS`, show "Confirming your transfer" and retry with the same key. Do not offer a fresh "Send again" until the outcome is known.
- **Result.** Success shows amount, recipient, reference and the actions Done, View receipt, Share. Failure shows the reason from the error catalogue and keeps the user's entries.

### 6.4 Activity and receipts

- Activity is a list grouped by day, newest first, with cursor pagination.
- Filters: All, Sent, Received, Added money.
- A receipt shows status, amount, counterparty, date and time (Africa/Lagos), note, and the `SPY_` reference with a copy action. Provider references are never shown.
- A receipt can be shared as an image. PDF can follow later.

### 6.5 Settings

- **Profile.** Name and email come from Spurs Accounts. They are read-only here, with a link to manage them in Accounts.
- **Tag.** Read-only once set.
- **Transaction PIN.** Set or change. Changing requires the current PIN and a recent sign-in (step-up, 5 minutes).
- **Appearance.** System, Light, Dark.
- **Sign out.** Lives here, not in the top header.

## 7. Business rules the UI must respect

| Rule | Value | Source |
| --- | --- | --- |
| Currency | NGN only | ledger |
| Storage | integer kobo | `src/lib/money.ts` |
| Amount input | up to 12 whole digits, up to 2 decimals, commas and `₦` accepted on paste | `parseNairaToKobo` |
| Per-transfer limit | ₦50,000 **placeholder** | `src/config/limits.ts` |
| Daily debit limit | ₦200,000 **placeholder** | `src/config/limits.ts` |
| Maximum wallet balance | ₦500,000 **placeholder** | `src/config/limits.ts` |
| PIN | 4 to 6 digits, 5 wrong tries then 15 minute lock | `PIN_POLICY` |
| Tag | 3 to 20 characters, lowercase letters, numbers and single underscores, starts with a letter, not reserved, cannot start with `spurs`, permanent | `src/config/tags.ts` |
| Note | 100 characters | `cleanNote` |
| Send rate limit | 10 per minute per user, 30 per minute per IP | `rate-limits.ts` |
| PIN verify rate limit | 10 per minute per user | `rate-limits.ts` |
| Idempotency key | 16 to 128 characters, `A-Z a-z 0-9 _ -` | `input.ts` |
| Sending requires | verified email, account not suspended, active wallet | `requireMoneyUser` |
| Sensitive changes require | sign-in within the last 5 minutes | `AUTH.stepUpMaxAgeSeconds` |

Do not hard-code limit values in components. Read them from config or an API so they can change without a redesign.

## 8. Error catalogue

The UI shows `error.message` from the API. It never invents its own wording for server errors, and it never shows raw codes. The "On screen" column says where the message appears and what else the UI does.

| Code | Server message | On screen |
| --- | --- | --- |
| `VALIDATION_FAILED` | Check the details and try again. (or a field message) | Highlight fields listed in `details.fields`. Message under the first one |
| `RECIPIENT_NOT_FOUND` | We could not find that tag. | Inline under the tag field. Keep what the user typed |
| `SELF_TRANSFER` | You cannot send money to yourself. | Inline under the tag field |
| `RECIPIENT_UNAVAILABLE` | This person cannot receive money right now. | Inline on Review. Disable Send |
| `WALLET_BALANCE_LIMIT` | The recipient wallet cannot receive this amount. | Inline on Amount |
| `INSUFFICIENT_FUNDS` | Insufficient balance. | Inline under the amount. Add the available balance and an "Add money" link |
| `TRANSFER_LIMIT_EXCEEDED` | This transfer is above your per-transfer limit. | Inline under the amount. Show the limit |
| `DAILY_LIMIT_EXCEEDED` | This transfer would exceed your daily limit. | Inline under the amount |
| `PIN_NOT_SET` | Set a transaction PIN before sending money. | Dialog with "Set PIN" action |
| `PIN_INVALID` | The PIN is incorrect. | In the PIN sheet. Clear the dots. Keep the sheet open |
| `PIN_LOCKED` | PIN attempts are temporarily locked. Try again later. | In the PIN sheet. Use `details.retryAfterSeconds` for "Try again in 14 minutes". Disable the keypad |
| `PIN_ALREADY_SET` | Your transaction PIN is already set. | Route to Change PIN |
| `EMAIL_NOT_VERIFIED` | Verify your email to continue. | Banner with link to Accounts |
| `ACCOUNT_SUSPENDED` | This account cannot move money right now. | Full-screen state with support contact. Hide money actions |
| `WALLET_UNAVAILABLE` | Your wallet is unavailable right now. | Same treatment as suspended |
| `STEP_UP_REQUIRED` | Confirm it is you to continue. | Explain in one line, then redirect to `details.loginUrl`, which returns to the same screen |
| `RATE_LIMITED` | Too many requests. Try again shortly. | Toast or inline. Use `details.retryAfterSeconds`. Disable the action until then |
| `IDEMPOTENCY_IN_PROGRESS` | This request is still being processed. | Stay on "Confirming your transfer". Retry with the same key |
| `IDEMPOTENCY_MISMATCH` | This request key was already used for a different request. | Should never reach a user. Treat as a bug: generate a new key, show generic error, log |
| `INVALID_TAG` | (message varies) | Inline under the tag field |
| `TAG_TAKEN` | That tag is taken. | Inline. Suggest editing |
| `TAG_ALREADY_SET` | Your tag is already set and cannot be changed. | Route to Settings |
| `SERVICE_UNAVAILABLE` | We could not verify your account. Try again shortly. | Inline with a Retry button |
| `UNAUTHENTICATED` | Sign in to continue. | Redirect to sign-in with `returnTo` |
| `FORBIDDEN` | Request not allowed. | Generic error. This is the CSRF check |
| `INTERNAL` | Something went wrong on our side. Try again. | Inline with Retry. Show the request id in small text for support |

Network failure (no response) is not an `AppError`. Show "You appear to be offline" for no connection, and "We couldn't reach Spurs Pay" for a timeout. Never claim a transfer failed after a timeout.

## 9. States every screen must handle

For each screen, design and build all of these. A screen is not done without them.

| State | Requirement |
| --- | --- |
| Loading | Skeleton that matches the final layout. No spinners on full pages |
| Empty | Says what belongs here and offers the next action |
| Error | Uses the catalogue above, with a way to retry |
| Offline | Shows cached content if any, and disables money actions with an explanation |
| Partial | List loaded but next page failed: keep the list, show a retry row |
| Blocked | Suspended, wallet unavailable, email unverified: explain and offer the fix |
| Success | One clear confirmation, then the next action |

## 10. Security and trust in the experience

- The PIN is never shown, logged, or stored on the client. Dots only. Clear the value on close.
- The PIN sheet blocks screenshots in the native shell later. For the web, at minimum keep it out of the address bar, history, and analytics.
- Step-up prompts explain why: "Confirm it is you to change your PIN."
- Show the last sign-in time in Settings later. It builds trust cheaply.
- Receipts and notifications use our `SPY_` reference. Never the provider's.
- Copy never promises more than the system guarantees. "Usually within a few minutes" is honest. "Instant" is only allowed for internal person-to-person transfers, which are instant ledger posts.

## 11. Provider secrecy in the UI

The payment provider must never be visible. For the UI that means:

- The funding account is called **Spurs Pay account** in every label, helper text and notification.
- The bank name attached to the funding account is data from the provider. It is the partner bank, not the provider, but verify with the real adapter that it does not contain a vendor brand. Strings that come from the provider are shown only if they pass that check.
- No provider logos, colours, names or URLs in any asset, page title, alt text, error, receipt or email.
- Error messages are ours. Raw provider text never reaches the screen.
- `npm run check:leaks` must pass after every UI change.

## 12. How we will know it works

Track these once analytics exist. Aim for direction, not vanity.

- Time from tapping Send to success screen (median, p90)
- Send completion rate: reached Review → success
- Share of sends that hit an error, by code
- Setup completion: signed in → tag and PIN set
- Support contacts about "where is my money" (should fall once the unknown-outcome state is clear)

## 13. Open decisions that affect the UI

| Decision | Why it matters to design |
| --- | --- |
| Real limit values and KYC tiers | Limit messages and any "upgrade" prompt depend on them |
| Daily limit window | Code counts a day in UTC, which resets at 1:00 am in Lagos. Either change the code to the Lagos day or word the UI as "resets at 1:00 am" |
| PIN reset | Change PIN needs the old PIN. A forgotten PIN has no path yet. Needs a design: step-up plus email confirmation, most likely |
| Fee for funding | Bank transfer funding fee is unstated. Add money copy must not claim "free" until confirmed |
| Money requests, QR | Scheduled for Phase 11. Reserve space in Home actions but do not render until built |
| Display name source | Recipients show `displayName` or `@tag`. Decide whether users can see and edit what others see |
