<!-- docs/screens.md -->
# Screens

Wireframes, content and states for each route. Components are named as in [design-system.md](design-system.md). Copy follows [content-guidelines.md](content-guidelines.md). Rules and error handling come from [product-spec.md](product-spec.md).

Wireframes are structure, not pixels. Sample data uses the real-content rule: Ada Okafor, Tunde Bello, Ngozi Eze, Emeka Obi, Fatima Yusuf.

Every screen below handles: loading, empty, error, offline, blocked and success where they apply (product-spec section 9).

## Shell

```
Mobile                              Desktop (768+)
┌──────────────────────────┐        ┌────────┬─────────────────────┐
│ Spurs Pay                │        │ Spurs  │                     │
├──────────────────────────┤        │ Pay    │   content (560)     │
│                          │        │        │                     │
│  content                 │        │ Home   │                     │
│                          │        │ Pay    │                     │
│                          │        │ Activ. │                     │
├──────────────────────────┤        │ Sett.  │                     │
│ Home  Pay  Activity  Set │        └────────┴─────────────────────┘
└──────────────────────────┘
```

Rules: a nav item exists only when its route is built. The "Verify your email" banner sits under the header while `emailVerified` is false.

## 1. Home `/`

```
┌──────────────────────────┐
│ Balance                  │
│ ₦12,500.00        [hide] │
│                          │
│ [   Send money   ]       │  ← primary
│ [ Add money ]            │  ← tonal
├──────────────────────────┤
│ Finish setting up        │  ← only until complete
│ ☐ Choose your @tag       │
│ ☐ Set your PIN           │
├──────────────────────────┤
│ Recent people            │
│ (AO) (TB) (NE) (EO)      │
├──────────────────────────┤
│ Recent activity   See all│
│ ┌──────────────────────┐ │
│ │ Tunde Bello    −₦850 │ │
│ │ Sent · 2:14 PM       │ │
│ ├──────────────────────┤ │
│ │ Added money +₦12,500 │ │
│ │ Received · Yesterday │ │
│ └──────────────────────┘ │
└──────────────────────────┘
```

Content:

- Balance label "Balance". `AmountDisplay` size `lg`. Hide toggle has `aria-pressed` and remembers the choice in `localStorage`.
- Only one filled button: Send money. Add money is tonal. Request and Scan are not rendered until Phase 11.
- Setup checklist shows only the missing items. Verify email appears first when needed. It is a plain list with check icons, not numbered. Each row links to its step.
- Recent people: up to 6, from `GET /api/recipients/recent`. Tapping one opens Pay with the recipient filled. Hidden when empty.
- Recent activity: last 5 rows in one `ListGroup`.

States:

| State | Treatment |
| --- | --- |
| Loading | `BalanceSkeleton`, avatar skeletons, three `ListRowSkeleton` |
| Empty activity | `EmptyState`: "No activity yet. Add money to get started." with an Add money link |
| Offline | Last known balance with caption "Last updated 2:14 PM". Send disabled with the reason below it |
| Setup incomplete | Send stays visible. Pressing it goes to the first missing step with the one-line reason |
| Suspended or wallet unavailable | Replace actions with the blocked state (screen 12) |

Dependencies: balance read and profile read (README, "Dependencies").

## 2. Pay, step 1: recipient `/pay`

```
┌──────────────────────────┐
│ ‹  Send money            │
│                          │
│ To                       │
│ [ @ada_okafor          ] │
│ Ada Okafor  @ada_okafor  │  ← lookup result
│                          │
│ Recent                   │
│ (AO) Ada Okafor          │
│      @ada_okafor         │
│ (TB) Tunde Bello         │
│      @tunde_b            │
│                          │
│ [      Continue      ]   │  ← bottom
└──────────────────────────┘
```

- Input label "To". Prefix `@`. Lookup runs when the tag is valid in shape and the user pauses for 400 ms, or on Continue. Rate limit: 30 per minute, so no lookup per keystroke.
- Result shows name and tag only.
- Typing filters recent people using `GET /api/recipients/recent?q=`.
- Continue is disabled until a recipient resolves.

States and errors: `RECIPIENT_NOT_FOUND` and `SELF_TRANSFER` appear under the field and keep the input. `RATE_LIMITED` disables Continue until `retryAfterSeconds` passes. Empty recent list hides the section.

## 3. Pay, step 2: amount `/pay/amount`

```
┌──────────────────────────┐
│ ‹  Ada Okafor            │
│    @ada_okafor           │
│                          │
│        ₦1,200.00         │  ← amount-xl, centred
│  Available ₦12,500.00    │
│                          │
│ [ Add a note (optional)] │
│                          │
│  1   2   3               │
│  4   5   6               │
│  7   8   9               │
│  .   0   ⌫               │
│ [      Review       ]    │
└──────────────────────────┘
```

- Amount centred (one of the three centre-aligned cases). Up to 12 whole digits and 2 decimals. The keypad blocks a third decimal.
- "Available" line uses the balance. If the typed amount exceeds it, the line turns `danger` and reads "You have ₦12,500.00. Add money" with a link. This is the `INSUFFICIENT_FUNDS` inline state, shown before the server is asked.
- Note field 100 characters, shows a counter at 80.
- Review is disabled at ₦0.

Errors inline under the amount: `TRANSFER_LIMIT_EXCEEDED` (with the limit read from config or API), `DAILY_LIMIT_EXCEEDED`, `WALLET_BALANCE_LIMIT`.

## 4. Pay, step 3: review `/pay/review`

```
┌──────────────────────────┐
│ ‹  Review                │
│                          │
│ You are sending          │
│ ₦1,200.00                │
│                          │
│ ┌──────────────────────┐ │
│ │ To       Ada Okafor  │ │
│ │          @ada_okafor │ │
│ │ Fee      No fee      │ │
│ │ Note     Lunch       │ │
│ └──────────────────────┘ │
│                          │
│ [   Send ₦1,200.00   ]   │
└──────────────────────────┘
```

- The idempotency key is generated when this screen mounts and kept for every retry. Changing recipient, amount or note creates a new key.
- Press Send: the button goes to `loading` immediately (double-tap guard) and opens the PIN sheet.
- Details are a `ListGroup` of label and value rows. Edit is a back action, not a button per row.
- `RECIPIENT_UNAVAILABLE` shows a `danger` banner above the summary and disables Send.

## 5. PIN sheet

```
┌──────────────────────────┐
│ ▬                        │
│ Enter your PIN        ✕  │
│ To send ₦1,200.00        │
│                          │
│       ● ● ○ ○            │
│                          │
│  1   2   3               │
│  4   5   6               │
│  7   8   9               │
│      0   ⌫               │
└──────────────────────────┘
```

- Opens over Review. 4 to 6 digits. With a 6-digit PIN, submit on the sixth digit. Because length is 4 to 6, show a Confirm button once four digits are entered.
- `PIN_INVALID`: clear dots, show "The PIN is incorrect." under the dots, keep the sheet open.
- `PIN_LOCKED`: disable the keypad, show "Try again in 14 minutes." using `retryAfterSeconds`.
- `PIN_NOT_SET` is caught earlier: dialog "Set a PIN to send money" with Set PIN.
- `STEP_UP_REQUIRED` explains in one line and redirects to `details.loginUrl`.
- The value is never put in the URL, storage or analytics, and is cleared on close.

## 6. Pay, result `/pay/result`

Success:

```
┌──────────────────────────┐
│          ✓               │  ← drawn once, 300 ms
│    You sent ₦1,200.00    │
│    to Ada Okafor         │
│                          │
│ Reference  SPY_8K2M…  ⧉  │
│ Sent       14 Nov, 2:14 PM│
│                          │
│ [        Done        ]   │
│ [ View receipt ] [Share] │
└──────────────────────────┘
```

Unknown outcome (timeout or `IDEMPOTENCY_IN_PROGRESS`):

```
│  Confirming your transfer│
│  This can take a moment. │
│  Please do not send again│
```

Retry with the same key at 2 s, 4 s, 8 s. After three tries show "We are still checking. You can leave this screen and check Activity." with a link. Never show "Send again".

Failure: show the catalogue message, keep the user's entries, offer Try again (same key if the outcome is unknown, new key if the request definitely failed validation).

A 200 response (replayed) renders exactly this success screen.

## 7. Activity `/activity`

```
┌──────────────────────────┐
│ Activity                 │
│ [All][Sent][Received][Added]│
│                          │
│ Today                    │
│ ┌──────────────────────┐ │
│ │ Tunde Bello    −₦850 │ │
│ │ Sent · 2:14 PM       │ │
│ ├──────────────────────┤ │
│ │ Ngozi Eze   +₦3,000  │ │
│ │ Received · 9:02 AM   │ │
│ └──────────────────────┘ │
│ Yesterday                │
│ …                        │
└──────────────────────────┘
```

- Grouped by Lagos day, newest first. Cursor pagination, loaded when the last row nears the viewport. Filters: All, Sent, Received, Added money.
- Row opens the receipt.
- States: skeleton rows; empty per filter ("No sent transfers yet."); next page failed shows a retry row at the bottom while keeping the list.

## 8. Receipt `/activity/[reference]`

```
┌──────────────────────────┐
│ ‹  Receipt               │
│                          │
│ Completed      ✓         │
│ ₦1,200.00                │
│                          │
│ ┌──────────────────────┐ │
│ │ To      Ada Okafor   │ │
│ │ Date    14 Nov 2026  │ │
│ │         2:14 PM      │ │
│ │ Note    Lunch        │ │
│ │ Ref     SPY_8K2M…  ⧉ │ │
│ └──────────────────────┘ │
│ [ Share receipt ]        │
└──────────────────────────┘
```

- Received transfers say "From". Added money says "Added money" with the sender name if known.
- Amount uses `amount-xl`. Status uses `StatusBadge`. Times are Africa/Lagos.
- The `SPY_` reference only. No provider reference anywhere.
- Share creates an image of the receipt card. Unknown reference gives a not-found state with a link to Activity.

## 9. Add money `/add-money`

```
┌──────────────────────────┐
│ ‹  Add money             │
│                          │
│ Transfer to your Spurs   │
│ Pay account from any     │
│ bank app. Your balance   │
│ updates when the transfer│
│ arrives.                 │
│                          │
│ ┌──────────────────────┐ │
│ │ Account name         │ │
│ │ Olaniyi Oladele   ⧉  │ │
│ │ Account number       │ │
│ │ 9912345678        ⧉  │ │
│ │ Bank                 │ │
│ │ Sample Bank One   ⧉  │ │
│ └──────────────────────┘ │
└──────────────────────────┘
```

- Copy action on each row, toast "Copied". Account number is shown in groups for reading but copied as plain digits.
- No claim of "free" or "instant" until the funding fee is confirmed (spec section 13).
- States: loading skeleton; `SERVICE_UNAVAILABLE` with Retry; bank name displayed only if it passes the provider-name check.

## 10. Settings `/settings`

```
┌──────────────────────────┐
│ Settings                 │
│ ┌──────────────────────┐ │
│ │ (OO) Olaniyi Oladele │ │
│ │ name@example.com     │ │
│ ├──────────────────────┤ │
│ │ Tag      @olaniyi  › │ │
│ │ PIN      Change    › │ │
│ │ Appearance System  › │ │
│ └──────────────────────┘ │
│ Manage your name and     │
│ email in Spurs Accounts. │
│                          │
│ [ Sign out ]             │  ← ghost
└──────────────────────────┘
```

- Name and email are read-only, with a link to Spurs Accounts.
- Tag row shows "Set your tag" when empty. Appearance opens a radiogroup: System, Light, Dark.
- Sign out is a form POST to `/auth/logout`.

### Tag `/settings/tag`

- Input with live shape checking (3 to 20, rules from `src/config/tags.ts`), prefix `@`.
- Confirmation step before save: "Your tag is permanent. Check it is right." with the tag shown large. Buttons: "Save tag" and "Edit".
- Errors: `INVALID_TAG` and `TAG_TAKEN` inline. `TAG_ALREADY_SET` routes back to Settings.
- Read-only view once set.

### Transaction PIN `/settings/pin`

- Not set: "Set a PIN" with two entries (enter, confirm) using the keypad and `PinDots`.
- Set: "Change PIN" with current PIN, new PIN, confirm. Requires a recent sign-in. `STEP_UP_REQUIRED` explains "Confirm it is you to change your PIN." and redirects, returning here.
- Forgotten PIN has no path yet (open decision). Show no "Forgot PIN" link until it exists.

## 11. Signed out `/signed-out`

Minimal, outside the shell. Wordmark, one heading, one sentence, one link.

- Signed out: "You're signed out" and "Sign in again".
- Sign-in failed (`?error=signin`): "We could not sign you in", "The sign-in was cancelled or expired. Try again." and "Sign in again".
- This file already exists at `src/app/signed-out/page.tsx`. Apply the wordmark and token classes only.

## 12. Blocked states

Full-screen, replaces money actions. Used for `ACCOUNT_SUSPENDED` and `WALLET_UNAVAILABLE`.

```
┌──────────────────────────┐
│ Spurs Pay                │
│                          │
│ ⚠                        │
│ Your account is on hold  │
│ You cannot send or       │
│ receive money right now. │
│                          │
│ [ Contact support ]      │
└──────────────────────────┘
```

Email unverified is not a full-screen block. It is the banner in the shell plus the inline `EMAIL_NOT_VERIFIED` message with a link to Accounts.

## 13. Offline and network failure

- No connection: banner under the header "You appear to be offline." Money actions disabled with the same reason beside them. Cached lists stay visible.
- Timeout: "We couldn't reach Spurs Pay." with Retry. Never say a transfer failed after a timeout. Use the unknown-outcome state (screen 6).
