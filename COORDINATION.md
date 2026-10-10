# Coordination — Claude × ChatGPT

Shared ledger for parallel work on BetterNatureApp. Each party updates its own rows; neither edits the other's rows. Before starting a task, add a row claiming the files; before touching a file, check no active row owns it.

## Rules of engagement

- Claude works on branch `claude/vigilant-nash` (and sub-branches cut off main as needed).
- ChatGPT works on its own branch(es), e.g. `gpt/*`.
- Never both edit the same file at the same time. If a file is contested, the second-mover claims it after the first-mover's PR merges (or they re-sync).
- Starting commit = SHA of `main` (or branch) at the moment work began. Always record it so hand-offs can replay the diff.
- When finishing a task, move the row from **Active** to **Done**, add final commit SHA and test results, and clear the files from the "owned files" list.

## Active

| Task | Owner | Branch | Files | Starting commit | Status |
|------|-------|--------|-------|-----------------|--------|
| Phase 1a — rules-only authorization hardening (audit A1, A3, A4, A5, A6, A7-partial) | Claude | claude/vigilant-nash | firestore.rules | 4962e86 | drafted, pre-review |

### Audit items in this slice

Covers from `BetterNature-Audit-and-Claude-Handoff.md`:

- **A1** — self-service executive creation: `cleanCreateFields()` restricts role on create to `['member','restaurant']`, bars `member_status: approved` for member creates, bars `disabled`/`disabled_at` seeding.
- **A3** — pickup authorization: field-level allow functions per transition (`isAtomicClaim`, `isSelfReleaseClaim`, `isSelfSetEnroute`, `isSelfUpdateFridge`, `isSelfReportSpoiled`, `isSelfHandoffEnroute`, `isSelfComplete`, `isSelfStampReceipt`, `isRestaurantVerify`, `isRestaurantCancel`). Each enforces old→new status, exact `changedKeys()`, and identity. Closes claim-via-update theft, forged completion, forged restaurant verification.
- **A3** — `restaurant_id` self-write limited to one-shot null→value transition.
- **A4** — `chapter_id` self-write blocked for users currently holding `chapter_president` / `chapter_pres`.
- **A5** — `tax_receipts` reads split into `get` (open, since doc id is a capability token) vs `list` (exec only). Closes anonymous collection list.
- **A6** — `notifications_outbox` create tightened to `isSignedIn()`. Anonymous chapter-application receipt-drop path now needs a Cloud Function (deferred to Phase 2).
- **A7** (partial) — `org_stats` updates must be non-negative forward bumps with per-field maximum deltas. Closes "SDK write meals: -9999 / 1e9" ticker-tank/inflation.

### Known breaking changes within this slice

- `src/screens/restaurant/RestaurantOnboarding.js:87` — alternate partner onboarding writes `restaurant_id` even when user already has one. Audit B2 already flagged this file as "uses incompatible record"; keeping it broken until that onboarding is rewritten.
- Website `firebase-auth.js:205` founder bootstrap tries to seed `role: 'super_admin'` at create — now denied. Founder must sign up as `member` and self-promote via the Founder Role Switcher (which still works via `isFounderToken()` in update rules). One-time production event; not worth another carve-out.
- `notifications_outbox` unauth drops from `chapter_applications` / `restaurant_signup` acknowledgments. Rules deny them now; needs a Cloud Function.

### Not in this slice (next PRs)

- **A2** — split `users` reads into `public_profiles` + private; too many call sites to break at once.
- **A7** (full) — move impact totals and donation ledgers to validated immutable operations.
- **A8** — merge/deletion integrity (server workflow).
- **B1–B6** — onboarding unification.
- **C1** — authoritative completion command (Cloud Function + repair ledger).
- Everything else in the audit's §C-§F.

## Done

| Task | Owner | Branch | Files | Start → End | Tests |
|------|-------|--------|-------|-------------|-------|
| _(none yet)_ |  |  |  |  |  |

## Hand-offs

_(Note here when work needs to be picked up by the other party: what's done, what's next, where to look.)_
