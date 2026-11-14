# Design principles

## 1. Direction in one paragraph

Spurs Pay should look like it was designed by a small team that cares about money software: quiet, precise, and confident. The amount is the hero. Everything else supports it. Colour is used for meaning, not decoration. The deep teal is the brand and appears on the primary action and little else. Surfaces are flat and separated by hairlines, not by shadows. Text is sentence case and written for a person in a hurry.

Reference points for calibration, not for copying: the clarity of Wise, the restraint of Monzo, the speed of Google Pay. If a screen could belong to any app, it is not done.

## 2. What "professional" means here

Professional fintech UI has five qualities. Every design decision should serve at least one.

1. **Legible.** Numbers align. Hierarchy is obvious in one second. Nothing needs explaining.
2. **Consistent.** The same thing looks and behaves the same everywhere: one radius family, one spacing scale, one way to show an amount, one word for each action.
3. **Restrained.** Few colours, few sizes, few effects. Each one has a job.
4. **Accurate.** Real data, real states, real error copy. No placeholder gloss.
5. **Calm.** Motion confirms actions. It never performs.

## 3. The one memorable thing

Spend boldness in one place and keep the rest disciplined.

**The memorable thing in Spurs Pay is the amount.** Large, tabular, tightly tracked numerals on a plain surface: the balance on Home, the amount on the keypad, the amount on the receipt. These are the same treatment, so a user learns it once.

The second distinct moment is the single success confirmation after a transfer. Nothing else gets special treatment.

## 4. Principles

### 4.1 Hierarchy comes from type and space, not boxes
Do not wrap every group in a bordered rounded card. Use whitespace and size first. Use a surface only when content needs to read as one object (the balance panel, a list container, a sheet).

### 4.2 Lists over tiles
Money apps are mostly lists: people, activity, settings. Build them as list rows inside one surface, separated by hairlines. Do not build them as rows of identical cards.

### 4.3 One primary action per screen
There is one filled primary button. Secondary actions are tonal or text. If two things compete, one of them is wrong.

### 4.4 Colour is semantic
- Teal: brand and primary action.
- Success green: money in, confirmed state.
- Danger red: failures and destructive actions only. Not for money going out.
- Warning amber: needs attention (limits, pending).
- Everything else is neutral ink and grey.

Money in is green with a `+`. Money out is normal text with a `−`. Red debits make every payment look like a problem.

### 4.5 Structure carries information
Dividers, borders, headings and icons exist because they tell the user something. If a divider does not separate two different things, remove it. Numbered steps only where the content is a real sequence (the send flow progress yes, a feature list no).

### 4.6 Real content, always
Design with real Nigerian names (Ada Okafor, Tunde Bello, Ngozi Eze, Emeka Obi, Fatima Yusuf), real amounts (₦12,500.00, ₦850.00, ₦1,250.50), and real states. Never "John Doe", "Lorem", `$`, or round demo numbers like ₦1,000,000.

### 4.7 Mobile first, then earn the desktop
The primary canvas is a 360 to 430 px phone. Desktop gets a proper layout (section 8), not a phone stretched or a phone floating in a void.

### 4.8 Accessible by default
Contrast, focus, labels, targets and reduced motion are part of the first build, not a later pass. See the checklist.

## 5. The AI tells to avoid

Generated interfaces cluster around the same defaults. Each is fine in isolation. Together they read as templated. Avoid these unless there is a stated reason.

| Tell | Why it reads generated | Do this instead |
| --- | --- | --- |
| Gradient washes on cards, hero blocks or buttons | The default way to make something "premium" | Flat surfaces. Let type and spacing carry the weight |
| Every block is an identical rounded card with the same soft shadow | The SaaS-card kit | List rows in one surface. Shadows only on floating layers (sheet, toast, menu) |
| One border radius on everything | No hierarchy of objects | Radius scale by role: control 12, card 16, sheet 24, avatar full |
| Emoji as icons, sparkles, "Welcome back 👋" | Filler personality | One icon set, one stroke weight. Plain greeting or none |
| Tracked-out ALL-CAPS eyebrow above every heading | Template chrome | Sentence-case headings. A label only when it adds information |
| Accenting a single word in a headline with colour or italic | Common generator move | One style per heading |
| `A · B · C` meta strings joined by middle dots | Template chrome | Separate lines, or a clear structure. A short "Sent · 2:14 PM" subtitle is allowed because the two parts are different kinds of fact |
| Arrows appended to every link and button ("Get started →") | Template chrome | Plain verbs. An arrow only where direction means something |
| Four equal action tiles with equal weight | No decision made | One filled primary action, others tonal |
| Fade-and-slide-up on every section, hover lift on every card | Scattered motion | Motion only for user actions and one confirmation (section 7) |
| Mono font for small labels | Decorative "techy" feel | One family. Tabular numerals for numbers |
| Near-black `#0B0B0B` or warm cream `#F4F1EA` with terracotta accent | The generated-site palette | The existing cool neutral and teal palette in `globals.css` |
| Hero stat trio with a gradient accent | Default dashboard | Balance is one figure on a flat surface |
| Placeholder-sounding copy ("Seamless payments for everyone") | Marketing filler | Specific, plain statements of what happens |
| Disabled buttons and "Coming soon" for unbuilt features | Looks unfinished | Hide the feature until it works |
| Fake charts and decorative stats | Padding | Only data the user needs, from real rows |
| Confetti, bouncing checkmarks, emoji on success | Trying too hard for delight | A single drawn check and a clear summary |

The test: could this screen be pasted into ten other apps unchanged? If yes, find the Spurs Pay specific part and strengthen it.

## 6. Brand expression

- **Wordmark.** "Spurs Pay" set in Figtree 700 with slightly tight tracking. No logo graphic until one is designed. Use the wordmark in the header and on sign-in and signed-out screens.
- **App icon (PWA).** A single geometric letter S monogram on solid teal, no gradient, no glow. Produce at 192 and 512 px plus a maskable version with safe padding.
- **Colour.** Teal `#0b6e6e` (light) and `#3fc1b7` (dark) on ink `#0f1b2d` and cool greys. Keep the palette in `globals.css` as the only source.
- **Typeface.** Figtree Variable, already installed through `@fontsource-variable/figtree`. Weights in use: 400, 500, 600, 700. Verify that the `₦` glyph renders in Figtree at every weight used. If it falls back to another font, include a fallback that has it and check that it matches in size and weight. This is a mandatory check for a Naira app.
- **Imagery.** None in the core app. No stock photos, no illustrations of people. Empty states use a small icon and a sentence.
- **Avatars.** Initials on a muted tint, chosen deterministically from the name, from a set of six tints derived from the palette. Never random per render.

## 7. Motion

Motion shows what changed. It never decorates.

| Use | Duration | Notes |
| --- | --- | --- |
| Press feedback on buttons and rows | 100 ms | Slight darken, or scale to 0.98 on buttons |
| Sheet open and close | 220 ms | Slide from bottom, fade the scrim |
| Toast in and out | 180 ms | Fade and 8 px rise |
| Page-level content swap (balance hide, tab filter) | 150 ms | Crossfade |
| Transfer success check | 300 ms once | Stroke draws in. Plays once, no loop |
| Skeleton | 1.4 s loop | Gentle opacity pulse, not a shimmering gradient sweep |

Easing: `cubic-bezier(0.2, 0, 0, 1)` for entering, `cubic-bezier(0.4, 0, 1, 1)` for leaving.

Not allowed: staggered section entrances on page load, parallax, hover lifts on cards, looping decorative animation, bouncing, confetti.

All of it is disabled or reduced when `prefers-reduced-motion` is set. `globals.css` already enforces this globally. Do not add `!important` overrides that bypass it.

Prefer CSS transitions and the Web Animations API. Add Framer Motion only if a gesture (sheet drag to dismiss) cannot be done well without it, and import it only in the components that need it.

## 8. Layout

### Mobile (default, below 768 px)

- Single column, 20 px side padding, content width up to 448 px (`max-w-md`, already in the layout).
- Top header 56 px. Bottom navigation 64 px plus the safe area inset.
- Sheets rise from the bottom. Full-screen routes for multi-step flows (Send).
- Primary action sits at the bottom of the screen on flow steps, above the safe area, so the thumb reaches it.

### Desktop (768 px and above)

- Navigation moves to a left rail, 240 px, with icon and label.
- Content column is 560 px wide, centred in the remaining space, with a 32 px top offset.
- Sheets become centred dialogs, 420 px wide.
- The send flow keeps a single column. Do not invent a two-pane layout for the sake of filling space.
- Keyboard works everywhere: Enter submits, Escape closes sheets, digits type into the keypad.

### Alignment

- Text is left-aligned. Headings are left-aligned.
- Amounts in lists are right-aligned so digits line up down the column.
- Centre alignment only for the success state, the PIN dots, and the keypad amount.

## 9. Writing and design are one job

Words follow the same rules as pixels: plain, specific, consistent. See [content-guidelines.md](content-guidelines.md). A beautiful screen with vague copy fails the same review as a plain screen with clear copy.

## 10. Decision log

When you choose against a rule in this document, add a line here with the date, the screen, and the reason. A rule broken on purpose is a design decision. A rule broken by accident is a bug.

| Date | Screen | Decision | Reason |
| --- | --- | --- | --- |
| | | | |
