<!-- docs/ui-quality-checklist.md -->
# UI quality checklist

Run this before a screen or component is called done. Copy the relevant sections into the pull request and tick them. If an item is skipped on purpose, add a line to the decision log in [design-principles.md](design-principles.md).

Review each screen at 360 px, 430 px and 1280 px wide, in light and dark.

## 1. Design fidelity

- [ ] Matches the wireframe and content in [screens.md](screens.md), or the doc was updated in the same pull request
- [ ] One filled primary action on the screen
- [ ] The amount is the strongest element where one appears
- [ ] Lists are one `ListGroup`, not a stack of identical cards
- [ ] No gradients, no decorative shadows, no emoji, no arrows in labels
- [ ] Radius, spacing and type use tokens from [design-system.md](design-system.md) only
- [ ] No hex values or arbitrary pixel sizes in components
- [ ] Money in is green with `+`, money out is normal text with `−`, red only for failure
- [ ] Nothing in the AI-tells table in design-principles section 5 is present
- [ ] Unbuilt features are hidden, not disabled

## 2. Content

- [ ] Copy follows [content-guidelines.md](content-guidelines.md): sentence case, approved vocabulary, no internal terms
- [ ] Server errors show `error.message` unchanged, never a code
- [ ] Every amount uses `AmountDisplay` and shows `₦` with kobo
- [ ] Sample data uses real names and amounts, never "John Doe" or round demo numbers
- [ ] Times are Africa/Lagos
- [ ] No promise of "instant" or "free" beyond what is true

## 3. States

- [ ] Loading uses a skeleton that matches the final layout
- [ ] Empty state says what belongs here and offers the next action
- [ ] Error state uses the catalogue and offers retry
- [ ] Offline shows cached data where it exists and disables money actions with a reason
- [ ] Partial failure (next page) keeps the list and shows a retry row
- [ ] Blocked state (suspended, wallet unavailable, email unverified) explains and offers the fix
- [ ] Success is one clear confirmation, then the next action
- [ ] Unknown outcome never shows failure and never offers "send again"

## 4. Money safety

- [ ] The confirm button disables and shows progress on the first press
- [ ] The `Idempotency-Key` is created once per transfer attempt and reused on retry, regenerated when recipient, amount or note change
- [ ] A 200 (replayed) response is treated as success and shows the same receipt
- [ ] The balance changes only from server data, never optimistically on funding
- [ ] Amount parsing uses `parseNairaToKobo`. No `parseFloat`, no `Number` on amounts
- [ ] The PIN is never stored, logged, put in a URL or sent to analytics, and is cleared when its sheet closes
- [ ] Limit values come from config or an API, not from component code

## 5. Accessibility

- [ ] Every interactive element is reachable and operable by keyboard, in a logical order
- [ ] Focus is visible on every element, including inside sheets and on dark surfaces
- [ ] Sheets and dialogs trap focus, close on Escape, and return focus to the trigger
- [ ] Touch targets are at least 44 × 44 px
- [ ] Text contrast is 4.5:1 or better (3:1 for text 18 px and up and for UI boundaries) in both themes
- [ ] Colour is never the only signal: status has an icon and text, errors have text
- [ ] Every input has a visible label, errors are linked with `aria-describedby`, and `role="alert"` announces them
- [ ] Icon-only buttons have an `aria-label`
- [ ] Amounts have a spoken form (`aria-label`)
- [ ] Toasts and status changes use `aria-live`
- [ ] Headings are in order, one `h1` per screen, landmarks present (`header`, `nav`, `main`)
- [ ] Page zooms to 200% without loss of content or horizontal scroll
- [ ] Works with a screen reader on one real flow (VoiceOver or TalkBack)

## 6. Motion

- [ ] Motion is limited to the table in design-principles section 7
- [ ] Durations and easing use the design-system classes
- [ ] No staggered entrances, parallax, hover lifts, looping decoration or confetti
- [ ] `prefers-reduced-motion` is respected and no `!important` bypasses it
- [ ] The success check plays once

## 7. Responsive and platform

- [ ] Layout holds from 320 to 430 px with no horizontal scroll
- [ ] Desktop (768 and up) uses the rail layout and centred dialogs, not a stretched phone
- [ ] Safe-area insets are applied to the header, bottom nav and bottom-fixed actions
- [ ] The primary action is reachable with a thumb on flow steps
- [ ] Inputs are 16 px or larger, with the right `inputMode` and `autocomplete`
- [ ] Digits, Enter, Escape and Backspace work on desktop keyboards in the keypad and sheets
- [ ] Layout does not jump when the balance is hidden or data loads
- [ ] Tested on a mid-range Android profile with throttled network (Chrome DevTools, "Slow 4G", 4x CPU slowdown)

## 8. Performance

- [ ] Server components by default. `'use client'` only where state or events need it
- [ ] Icons imported individually, no barrel imports
- [ ] No Framer Motion unless a gesture needs it, and only imported in that component
- [ ] Images: none in the core app. Any new asset has a width and height
- [ ] No layout shift when fonts load (Figtree is bundled through `@fontsource-variable/figtree`)
- [ ] `next build` output shows no unexpected growth in the first-load JS for the route

## 9. Provider secrecy

- [ ] No provider name, logo, colour, URL or hint in markup, alt text, titles, copy or assets
- [ ] Strings that come from the provider (bank name) pass the vendor-brand check before display
- [ ] Only `SPY_` references are shown
- [ ] `npm run check:leaks:source` and `npm run check:leaks` pass

## 10. Code

- [ ] `npm run typecheck`, `npm run lint` and `npm test` pass
- [ ] No business logic in components. Mutations call route handlers or server actions that call module services
- [ ] No `any` in money paths
- [ ] Components accept `className`, merge with `cn`, and forward element props
- [ ] New components appear on `/dev/ui` in every state and both themes
- [ ] Tests exist for new pure logic (formatters, parsers, tint hashing, spoken amounts)

## 11. Sign-off

| Check | Reviewer | Date |
| --- | --- | --- |
| Design fidelity | | |
| Content | | |
| Accessibility (keyboard and screen reader) | | |
| Small-phone and desktop pass | | |
| Leak check | | |
