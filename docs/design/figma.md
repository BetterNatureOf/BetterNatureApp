# BetterNature in Figma

Source of truth for UI: **[BetterNature — Design System & Product](https://www.figma.com/design/CFEizDPz71IXFg8gnqXI0C)** (Figma, student team plan).
Version 0.1, built 2026-11-22. No app code has changed.

## Decisions

| Decision | Status |
| --- | --- |
| Primary button: Blossom 600 → 550 gradient (`#C13D5B` → `#C9405E`) | **Approved 2026-11-22 (Option A).** Not yet in `colors.js` |
| Placeholder Gray 500 `#6B7280` | pending |
| Field border Gray mid `#8E95A2` | pending |
| Brand palette, typography, Petal line icons | pending |

## Pages

| Page | Status | Contents |
| --- | --- | --- |
| 00 Product Strategy | built | Audiences, principles, decisions waiting for approval, file index, heuristic + accessibility review, research plan |
| 01 Foundations | built | Variables: Primitives (41 colours), Color (51 semantic), Dimension (19), Motion (9). 18 text styles, 6 effect styles. Palette reconciliation, WCAG 2.2 AA contrast audit, type evaluation, spacing, radius, elevation, motion |
| 02 Component Library | built | 19 components / sets, main components in the "Components (main)" section, review frame with every variant |
| 03 Custom Iconography | built | 19 original "Petal line" icons (24 grid, 1.75 stroke) + 25 Lucide utility icons, all components |
| 04 Volunteer Mobile App | built | Welcome, Rescues list, Impact, Profile vehicle |
| 05–09, 11 | placeholder | Labelled with planned scope |
| 10 Interactive Prototypes | built | Wired volunteer rescue flow (P01–P10) + recovery frames (E1–E5), flow "Volunteer rescue · happy path + recovery" |
| 12 Developer Handoff | built | Token → code table, text styles, component → file map, backend status → UI mapping |

## Contrast results (WCAG 2.2 AA)

Fails today:

| Pair | Ratio | Where |
| --- | --- | --- |
| White on Pink `#E8627C` | 3.25:1 | primary button (start of gradient) |
| White on Coral `#F08B6D` | 2.44:1 | primary button (end of gradient) |
| Pink `#E8627C` on Cream | 3.06:1 | secondary button, Sign in link |
| Gray mid `#8E95A2` on White | 3.01:1 | placeholder text |
| Gray light `#E8EBF0` on White | 1.20:1 | input border (fails 1.4.11 non-text, needs 3:1) |
| White on Sage / Amber / IRIS teal / Hydro sky | 1.90 / 2.02 / 2.82 / 1.95:1 | never put white text on these |
| White on Hydro deep `#4A8E9A` | 3.73:1 | large text only |

Fixes (the Figma components already use them; only the primary gradient is approved so far):

| Token | Value | Ratio |
| --- | --- | --- |
| Primary gradient (approved) | Blossom 600 `#C13D5B` → Blossom 550 `#C9405E` | 5.14 → 4.80:1 with white |
| Option B (not chosen) | solid Green `#2A5648` | 8.32:1 |
| Pink text / links | Blossom 600 on Cream | 4.85:1 |
| Placeholder | Gray 500 `#6B7280` | 4.83:1 |
| Field border | Gray mid `#8E95A2` | 3.01:1 |

Passes include white on Forest (12.11), Green (8.32), Botanical (5.58); Green on Cream (7.85); Forest on Sage (6.38); Ink on Cream (15.48); Gray on Cream (5.70); error red on White (6.57).

## Typography

The app uses Inter for UI and Instrument Serif for display on web (`typography.js`). `BrushText.js` no longer renders a brush face. It maps screenTitle and sectionHeader to the serif. Plus Jakarta Sans was evaluated and not adopted: it would add a third family and its figures are proportional by default.

## Prototype statuses

Frames are annotated with the backend state from `firestore.rules` `pickupUpdateAllowed`: `available` → `claimed` → `enroute` (after donor verification) → `receiving_receipt` → `completed`. The frames also cover `safety_hold` (E3), turned-away pounds blocking completion (E4), the client-only offline queue (E5), an expired offer (E1) and a lost claim race (E2). "PROTOTYPE ONLY" panels simulate outcomes and must not ship.

## Known limits of the Figma build

- Gradient fills can't bind colour variables through the Plugin API (the stops render black), so the gradients use resolved hex values. Solid fills, strokes, radii, spacing and control heights are bound.
- Text component properties are shared across all variants of a set. Input and Select therefore don't expose a Value property; override the text layer directly.
- Code Connect isn't set up. Add it after the library is approved and published.
- The map is an original illustration, not a real map style.
- Only the Light mode exists. There's no dark mode yet.

## Code change still to make for the approved primary

In `src/config/colors.js`, set `gradient.pink` to `['#C13D5B', '#C9405E']`. Use `#C13D5B` wherever pink is text or a border: the secondary button and the Sign in link. Re-tint `Shadows.button` in `theme.js` to `#C13D5B`. Keep `pinkLight` as it is.
