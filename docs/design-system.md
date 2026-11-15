<!-- docs/design-system.md -->
# Design system

Tokens, type, spacing, radius, motion and component specs. Decisions about *why* live in [design-principles.md](design-principles.md). This file says *what exactly*.

The only source for colour, radius and font is `src/app/globals.css`. Components use Tailwind token classes (`bg-surface`, `text-muted`, `rounded-card`). Never write a hex value in a component.

## 1. Tokens to add to `globals.css`

The current file has the core palette. Phase 9 adds soft semantic fills and a scrim, and corrects the radius scale to match design-principles (control 12, card 16, sheet 24).

```css
/* src/app/globals.css: add inside :root */
--success-soft: #e3f4e8;
--warning-soft: #fbeed6;
--danger-soft: #fbe4e4;
--scrim: rgb(9 17 30 / 0.5);

```

```css
/* src/app/globals.css: add inside the dark @media :root block */
--success-soft: #10301d;
--warning-soft: #3a2a0c;
--danger-soft: #3a1616;
--scrim: rgb(0 0 0 / 0.6);

```

```css
/* src/app/globals.css: add inside @theme inline, and change the two radius values */
--color-success-soft: var(--success-soft);
--color-warning-soft: var(--warning-soft);
--color-danger-soft: var(--danger-soft);
--color-scrim: var(--scrim);
--radius-control: 0.75rem; /* 12 (was 0.875rem) */
--radius-card: 1rem;       /* 16 (was 1.25rem) */
--radius-sheet: 1.5rem;    /* 24 */

--ease-enter: cubic-bezier(0.2, 0, 0, 1);
--ease-leave: cubic-bezier(0.4, 0, 1, 1);
```

Record the radius change in the decision log in design-principles.md.

## 2. Colour roles

| Token | Use | Never use for |
| --- | --- | --- |
| `background` | Page | Cards |
| `surface` | Cards, sheets, list containers, nav | Page |
| `sunken` | Input fill, skeleton, pressed rows, segmented control track | Large areas |
| `foreground` | Primary text, money out | Disabled text |
| `muted` | Secondary text, helper text, placeholders, icons | Anything that must be read first |
| `border` | Hairlines between rows, input borders, card edges | Emphasis |
| `primary` | The one filled action, links, focus ring, selected state | Decoration, headings |
| `primary-soft` | Tonal button, selected row, info banner | Page fills |
| `success` / `success-soft` | Money in (`+`), confirmed status, success check | Buttons |
| `warning` / `warning-soft` | Pending, limits, needs attention | Errors |
| `danger` / `danger-soft` | Failed, destructive actions, field errors | Money going out |

Money in is `text-success` with a `+`. Money out is `text-foreground` with a `−` (U+2212, not a hyphen).

Contrast: body text and `muted` on `background` and `surface` must stay at 4.5:1 or better in both themes. Check `warning` text on `warning-soft` before shipping; if it fails, use `foreground` for the text and keep `warning` for the icon only.

## 3. Typography

One family: Figtree Variable (`font-sans`). Weights 400, 500, 600, 700 only.

| Role | Size / line | Weight | Tracking | Use |
| --- | --- | --- | --- | --- |
| `amount-xl` | 48 / 52 | 700 | −0.02em | Checkout and receipt amount |
| `amount-lg` | 40 / 44 | 700 | −0.02em | Reserved for a prominent payment amount |
| `amount-md` | 20 / 24 | 600 | −0.01em | Checkout summary and list amounts |
| `title` | 24 / 30 | 700 | −0.01em | Screen title |
| `heading` | 18 / 24 | 600 | 0 | Section heading |
| `body` | 16 / 24 | 400 | 0 | Default text, input text |
| `body-strong` | 16 / 24 | 600 | 0 | Row primary text, buttons (lg) |
| `body-sm` | 14 / 20 | 400 | 0 | Helper text, secondary row text, buttons (md) |
| `caption` | 12 / 16 | 500 | 0 | Timestamps, badges. Never below 12 |

Rules:

- Every amount uses the `.amount` class (tabular, lining numerals, tight tracking).
- Inputs are 16 px or larger so iOS does not zoom on focus.
- Sentence case everywhere. No uppercase transforms.
- Check the `₦` glyph at 400, 500, 600 and 700 before locking the scale. If Figtree falls back for it, add a fallback family that matches size and weight and set it in `--font-sans`.

Tailwind mapping: define the roles as utilities in `globals.css` (`@utility text-title { ... }`) so components say `text-title`, not a string of sizes.

## 4. Spacing and layout

4 px base. Use only: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64.

| Where | Value |
| --- | --- |
| Screen side padding | 20 |
| Between sections | 24 |
| Between a heading and its content | 12 |
| List row vertical padding | 12 (row height at least 56) |
| Inside a card | 16 for lists and other card content |
| Primary action bottom offset | 16 above safe area |

Touch targets are 44 × 44 px at minimum. Row height 56 px. Buttons: `md` 44, `lg` 56.

## 5. Radius

| Role | Token | px |
| --- | --- | --- |
| Buttons, inputs, banners, segmented controls | `rounded-control` | 12 |
| Cards, list containers | `rounded-card` | 16 |
| Sheets (top corners), dialogs | `rounded-sheet` | 24 |
| Avatars, PIN dots, switches | `rounded-full` | full |

## 6. Elevation

Surfaces are flat and use a 1 px `border`. Shadows exist only on floating layers.

| Layer | Treatment |
| --- | --- |
| Cards, lists, nav | Border only |
| Sheet, dialog | `shadow-[0_8px_32px_rgb(0_0_0/0.16)]` plus scrim |
| Toast | `shadow-[0_4px_16px_rgb(0_0_0/0.14)]` |

## 7. Icons

One set, one stroke weight. Use `lucide-react` at 1.75 stroke, sizes 20 (inline), 24 (nav, buttons). Import icons individually. Icons never carry meaning alone: pair with text or an `aria-label`.

Needed first: `Home`, `CreditCard` (payment methods), `Clock` (activity), `Settings`, `Plus`, `Copy`, `Check`, `ChevronRight`, `ChevronLeft`, `X`, `Info`, `WifiOff`, `Share`.

## 8. Motion

Durations and easing come from design-principles section 7. Expose them as classes:

| Class | Value |
| --- | --- |
| `duration-press` | 100 ms |
| `duration-toast` | 180 ms |
| `duration-sheet` | 220 ms |
| `duration-swap` | 150 ms |

Entering uses `ease-enter`, leaving uses `ease-leave`. The reduced-motion block in `globals.css` stays as is.

## 9. Components

All live in `src/components/ui/`. Each is a plain function component, accepts `className`, merges with `cn`, and forwards standard element props. No business logic.

### Button (exists, extend)

File: `src/components/ui/button.tsx`

| Prop | Values |
| --- | --- |
| `variant` | `primary`, `secondary`, `ghost`, `danger` (new) |
| `size` | `md` (44), `lg` (56) |
| `loading` (new) | Shows a 16 px spinner in place of the label, sets `aria-busy`, disables the button |

- `danger`: `bg-danger text-white`. Only for destructive actions (sign out is not destructive).
- Press: `active:scale-[0.98]` plus the existing brightness change, 100 ms.
- Full-width on mobile flow steps (`className="w-full"`).
- Disabled: 45% opacity, no pointer events. Do not use disabled to hide unbuilt features.

### Input

File: `src/components/ui/input.tsx`

- Height 52, `rounded-control`, `bg-sunken`, 1 px transparent border, 16 px text.
- Focus: border and ring `primary`. Error: border `danger`, message below in `danger` `body-sm` with `role="alert"`.
- Props: `label` (required, always visible above the field), `hint`, `error`, `prefix`, `suffix`.
- Checkout amounts are server-owned and displayed read-only. Do not add a customer amount input to checkout.
- Label is linked with `htmlFor`. Error is linked with `aria-describedby`. No placeholder-as-label.

### ListRow and ListGroup

Files: `src/components/ui/list-row.tsx`, `src/components/ui/list-group.tsx`

- `ListGroup`: one `Card` with `divide-y divide-border` and `overflow-hidden`. This is the container for payment methods, activity and settings.
- `ListRow`: min height 56, padding 12 × 16, grid: leading (avatar or icon) | text (primary 16/600, secondary 14 muted) | trailing (amount or chevron).
- Interactive rows render as `<a>` or `<button>`, with `active:bg-sunken` and a visible focus ring inset.
- Trailing amount is right-aligned, `amount-md`, with sign and colour per section 2. A trailing `caption` can show status.

### Avatar (retained shared component)

File: `src/components/ui/avatar.tsx`

- Sizes 32, 40, 48. Initials (max two letters) in 600 weight, on a tint.
- Retained for shared/legacy UI; not used for Pay payment methods or checkout.
- Tint index is deterministic from the displayed name. Never `Math.random`.
- `aria-hidden` when the name is printed beside it.

### Sheet

File: `src/components/ui/sheet.tsx`

- Mobile: bottom sheet, `rounded-t-sheet`, max height 90dvh, safe-area padding, 36 × 4 grabber, scrim `bg-scrim`.
- Desktop (768 and up): centred dialog, 420 wide, `rounded-sheet`.
- Built on the native `<dialog>` element, so focus trap, Escape and inert background come free. Return focus to the trigger on close.
- Title is required (`aria-labelledby`). Close button 44 × 44 top right.
- Used for: short checkout actions and share options. Wallet PIN entry is not a Pay sheet.

### Dialog

File: `src/components/ui/dialog.tsx`

- Same shell as Sheet but always centred, 360 wide, for short blocking messages with up to two actions.
- Primary action right (or on top on mobile), secondary as `ghost`.

### Toast

File: `src/components/ui/toast.tsx`

- Bottom, above the nav, 16 px from the edges, `rounded-control`, `bg-foreground text-background`.
- One at a time. 4 s for info, stays until dismissed for errors with an action ("Retry").
- Container has `role="status"` and `aria-live="polite"`. Error toasts use `role="alert"`.
- Toasts confirm small things (Copied). They never carry the only record of a money outcome.

### Skeleton

File: `src/components/ui/skeleton.tsx`

- `bg-sunken rounded-control`, opacity pulse 1.4 s between 1 and 0.55. No gradient sweep.
- Compose skeletons to match the real layout: `ListRowSkeleton`.

### StatusBadge

File: `src/components/ui/status-badge.tsx`

| Status | Fill | Text |
| --- | --- | --- |
| `success` | `success-soft` | Completed |
| `pending` | `warning-soft` | Processing |
| `failed` | `danger-soft` | Failed |

- `caption` size, `rounded-full`, 4 × 8 padding, with a 16 px icon before the label. Colour is never the only signal.

### EmptyState

File: `src/components/ui/empty-state.tsx`

- 24 px icon in `muted`, one sentence of `body`, optional single action. Centred. No illustration.

### Banner

File: `src/components/ui/banner.tsx`

- `rounded-control`, 12 × 16 padding, icon, text, optional action link. Tones: `info` (`primary-soft`), `warning`, `danger`.
- `role="status"` for info, `role="alert"` for danger.

### AmountDisplay

File: `src/components/ui/amount-display.tsx`

- Props: `kobo: bigint`, `size: 'xl' | 'lg' | 'md'`, `sign?: 'in' | 'out' | 'none'`, `hideZeroKobo?`.
- Renders `formatNaira` output with the `.amount` class and the sign rules from section 2.
- Adds an `aria-label` with the spoken form (see content-guidelines section 5).
- The only place that renders an amount. No component calls `formatNaira` directly in JSX.

### Keypad and PinDots (legacy transfer-flow components)

Files: `src/components/pay/keypad.tsx`, `src/components/pay/pin-dots.tsx`

These legacy components are not part of Pay checkout. Wallet may reuse them only after a separate product and security review; do not collect a Wallet PIN in Pay.

### Segmented control

File: `src/components/ui/segmented.tsx`

- For Activity filters and the appearance setting. `bg-sunken` track, selected segment `bg-surface` with a 1 px border. `role="tablist"` for filters, `role="radiogroup"` for appearance.

## 10. Layout shell

File: `src/app/(app)/layout.tsx`

- Mobile: header 56 with the wordmark, bottom nav 64 plus safe area, content `max-w-md`, `px-5`.
- Desktop (768 and up): left rail, expanded 240 or collapsed 72 (icons only, labels in `title` and screen-reader text). The toggle sits at the top of the rail. State is stored in the `spurs_pay_nav` cookie and read on the server. Content column 560 (904 with the side column at 1024), `pt-8`. The bottom nav is hidden.
- Rail footer: account link to Settings, then Sign out.
- Navigation labels: Home, Payment methods, Activity, Settings. Nav items appear only if their route exists. No disabled items. Checkout is opened by a first-party product, not from navigation.

## 11. Dark mode

Follows `prefers-color-scheme` by default. Settings > Appearance writes a `data-theme` attribute (`light` or `dark`) on `<html>` and a cookie, read in `layout.tsx` so there is no flash. Tokens switch under `[data-theme='dark']` as well as the media query. Every component is checked in both themes on the `/dev/ui` page.

## 12. Dev page

`src/app/dev/ui/page.tsx` renders every component in every state, in both themes, and returns `notFound()` when `NODE_ENV === 'production'`. It is the review surface for the checklist.
