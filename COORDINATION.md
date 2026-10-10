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
| Phase 1a — rules-only authorization hardening (audit A1, A3, A4, A5, A6, A7-partial) | Claude | claude/vigilant-nash | firestore.rules | 4962e86 | committed `ba1ff86`, pre-review |
| A2 — profile + ID disclosure lockdown (public_profiles mirror, locked `/users` reads, locked ID storage) | Claude | claude/a2-public-profiles | firestore.rules, storage.rules, functions/*, src/services/{publicProfiles,notify,referrals,database}.js, src/screens/{auth/WelcomeScreen,projects/IrisScreen}.js, workers/notification-dispatcher/src/worker.js, website/firebase-auth.js, scripts/{backfill-public-profiles,test-a2-rules}.* | 54cd9a5 | drafted, pre-review |

### A2 fifth review response (post-ChatGPT review of f1b8b54)

ChatGPT's fifth review confirmed the harness passes 57/57 and all seven regression probes pass. Five remaining findings G1–G5. This commit closes all five.

| G# | Fix | Where |
|----|-----|-------|
| **G1** Gate accepts null status via self-written flags | `requireVerifiedId` and `requireWaiverOnly` now REQUIRE `verification_status === 'approved'`. Null / pending / rejected / absent all fail. Presence flags are no longer sufficient for authorization. Dashboard badge same discipline. | `src/services/idGate.js`, `src/screens/main/DashboardScreen.js` |
| **G2** Client-controlled released_at + non-idempotent calls | Rules require `released_at == request.time` AND `handoff_at == request.time` — a future stamp is denied. Service writes `serverTimestamp()` for both. Callable rejects negative age (`now - released_at < 0`). New `/notification_dedup/{key}` collection: pickup intents reserve a key derived from the transition timestamp; a replay returns `{deduped: true, queued: 0}`. Deny-all client-write rule on the collection; only admin SDK writes. | `firestore.rules`, `src/services/database.js`, `functions/queueNotification.js` |
| **G3** JWT scope mismatch for accounts:lookup | Dispatcher scope changed from `firebase` to `identitytoolkit` (documented scope for `projects.accounts:lookup`). IAM requirement added to the worker header: `roles/firebaseauth.viewer` alongside `roles/datastore.user`. | `workers/notification-dispatcher/src/worker.js` |
| **G4** Incomplete ledger entries trusted + post-rotation overwrite | `ledgerStatus()` returns `absent`/`incomplete`/`ok`/`superseded`/`missing`; only `ok` short-circuits re-rotation. Phase 4 revalidates each path's live Storage generation + token against the state we captured during rotation BEFORE confirming it for clearing. Counters increment OUTSIDE the Firestore transaction so retries don't double-count. | `scripts/revoke-id-download-tokens.js` |
| **G5** Legacy non-canonical paths blocked at migration | `canonicalPathOk()` enforces `id-docs/<kind>/<uid>-<side>-<digits>.<ext>` with the owner's exact uid. Phase 4 refuses to mint `/id_reviews` OR clear `/users` for a non-canonical path; those are deferred. Final JSON output surfaces `non_canonical_paths` explicitly so an operator can confirm production has none or canonicalize them. | `scripts/revoke-id-download-tokens.js` |

### Positive-flow + regression tests added

- `scripts/test-idgate.cjs` — 8 standalone unit cases for G1 covering missing/null/pending/rejected/presence-only (all deny) and approved (allow). Runs under plain Node without the emulator. **Verified locally: 8/8 pass.**
- Harness extension — G2 regression: future `released_at` denied; omitted `released_at` denied. Positive serverTimestamp path is exercised by the B4 integration flow already in the harness.
- Harness still carries all prior assertions (57/57 last run); the two new G2 assertions bring it to 59. Pending ChatGPT re-run on Java-equipped host for independent confirmation.

### Local verification run

- `npm ci --ignore-scripts --dry-run --no-audit --no-fund` → "up to date" (no `--legacy-peer-deps`) ✓
- `node --check` on 20 touched JS files ✓
- `node scripts/test-idgate.cjs` → 8/8 pass ✓
- GitHub CI: expected 4/4 after this push lands.
- Emulator harness: still blocked on this host (no Java; `/usr/libexec/java_home` and `brew install openjdk@17` both fail — Xcode-license wall needs sudo). ChatGPT's prior round passed 57/57; this round adds 2 new rule assertions and preserves every passing one.

### Deployment notes

- Dispatcher now needs `roles/firebaseauth.viewer` on the service account (addition to the existing `roles/datastore.user`). Update the service account IAM in staging before cutover; a 403 on the Auth lookup suppresses BOTH push and email during the retry window.
- The notification dedup ledger lives in `/notification_dedup/` and is unbounded. If pickup volume warrants, add a scheduled cleanup Cloud Function later; the collection is small per pickup and inert.

### ChatGPT handoff — fifth review

Please run the exact gate and report:
1. **G1** — unit test `node scripts/test-idgate.cjs` prints "all 8 cases passed". ALSO: emulator proof that a user with self-written `id_front_present:true, contract_volunteer_signed:true, driver_setup_complete:true` and NO `verification_status` cannot pass the gate (test is now purely in idGate.js since presence flags remain self-writable).
2. **G2** — the two new assertions in `scripts/test-a2-rules.cjs` for future/missing `released_at` pass; the positive path through `cancelClaim` still works (serverTimestamp == request.time).
3. **G3** — JWT scope string equals `.../auth/datastore .../auth/identitytoolkit`. Deployed IAM test will happen in staging only; this review does not touch production.
4. **G4** — ledger with only `status:'rotated'` re-rotates on rerun; object replaced AFTER rotation but BEFORE Phase 4 keeps the `/users` URL (deferred).
5. **G5** — non-canonical `id-docs/<uid>-front-<ts>.jpg` path appears in `non_canonical_paths` output and neither clears `/users` nor mints `/id_reviews`.

### A2 fourth review response (post-ChatGPT review of c52c8f1)

ChatGPT's fourth review passed the compatible harness (fixed seed only) at 55/55 and confirmed CI green. It surfaced F1–F11 — mostly workflow gaps and race corner cases. This commit closes all 11.

| F# | Fix | Where |
|----|-----|-------|
| **F1** New-model approved volunteers failing the gate | `requireVerifiedId` / `requireWaiverOnly` accept `id_front_present` or `verification_status === 'approved'` (legacy `id_document_url` kept as a bridge). Dashboard badge same. | `src/services/idGate.js`, `src/screens/main/DashboardScreen.js` |
| **F2** DriverSetup still writes bearer URLs | `DriverSetup` → `submitIdReview({ kind: 'driver' })`. `saveDriverSetup` no longer accepts/writes license URL fields; only driver metadata (type, holder, consent) persists on `/users`. | `src/screens/auth/DriverSetup.js`, `src/services/verifications.js` |
| **F3** Status-sync restores old approval on late events | Trigger reads live `/id_reviews/{uid}` inside the transaction instead of using `change.after`. Delayed approve-after-reject events can no longer regress the mirror. | `functions/syncIdReviewStatus.js` |
| **F4** Revocation read/write race | Phase 4 is now one `runTransaction` reading `/users` + `/id_reviews` together. Only mints review mappings where the review slot is empty; preserves newer uploads AND existing reviewer decisions. Does not overwrite a reviewer's status with legacy `verification_status`. | `scripts/revoke-id-download-tokens.js` |
| **F5** Ledger-skip trusts stale rotated status | Rerun calls `ledgerEntryIsStillValid` which refetches live metadata and compares both the stored generation AND the stored token. Overwritten objects re-rotate. | `scripts/revoke-id-download-tokens.js` |
| **F6** Migration metadata blocks resubmission | Rules split into `cleanIdReviewOwnerCreate` (hasOnly owner fields) and `cleanIdReviewOwnerUpdate` (changed-fields hasOnly, server fields preserved). Service writes only the owner-authored subset on resubmission. | `firestore.rules`, `src/services/idReview.js` |
| **F7** Mirror revision guard too eager | Removed the `source_rev >= incoming` skip. The transaction's live read + rewrite is the sole guard; same-timestamp legit changes no longer get dropped. | `functions/lib/publicProfileProjection.js` |
| **F8** Unverified email delivery | Dispatcher resolves the Firebase Auth record via Identity Toolkit `accounts:lookup`, delivers email only when `emailVerified === true` AND the `/users.email` matches the Auth email (case-insensitive). JWT scope widened to include `firebase`. | `workers/notification-dispatcher/src/worker.js` |
| **F9** Ex-claimant indefinite authority + handoff state | Callable only honours `pk.released_by` within 30 min of `pk.released_at`, same for `pk.handoff_from_uid` vs `pk.handoff_at`. `isSelfHandoff` now accepts both `claimed`/`enroute` to match the service's state set. `cancelClaim` stamps `released_at`. | `functions/queueNotification.js`, `firestore.rules`, `src/services/database.js` |
| **F10** Harness seed blocks reinitialise Firestore | `seedBlock(env, fn)` helper centralises `const db = ctx.firestore()`. Every seed-block in the harness updated. | `scripts/test-a2-rules.cjs` |
| **F11** ManageVerifications parses UID from path | Thumbnail minting uses the joined row's uid + known kind/side directly; no reverse-regex on the path. Works for hyphenated UIDs. | `src/screens/admin/ManageVerifications.js` |

Positive-flow + regression tests added to `scripts/test-a2-rules.cjs`:
- F6 — rejected migrated user resubmits with new paths, status flips to pending, migration metadata preserved. Self-approve still denied.
- Hyphenated UID (`alice-member`) accepted by `cleanIdReviewOwnerCreate` path pattern.
- B4 — self-release stamps `released_by` + `released_at` and passes.

### Local verification run

- `npm ci --ignore-scripts --dry-run --no-audit --no-fund` → "up to date" (no `--legacy-peer-deps`) ✓
- `node --check` on 20 touched JS files ✓
- GitHub CI: 4 passing on `c52c8f1`; next commit (this one) will trigger a re-run.
- Emulator harness: **not executed on this host** — no Java runtime; `brew install openjdk@17` and `/usr/libexec/java_home` both fail with the Xcode-license wall (needs sudo). All seed blocks now follow the handle-caching pattern ChatGPT demonstrated; the review's temporary-copy pass at 55/55 is the closest signal available, and the pattern applied here is identical. Final confirmation needs ChatGPT's Java-equipped host.

### Explicitly still open

- **Original 25-defect items 2–8, 17–23, 25** stay tracked outside A2. C1 idempotent completion remains the next priority after A2 lands.
- **Dispatcher per-row lease** for concurrent dispatcher instances — current implementation is single-worker-safe.
- **President-scoped donations endpoint** — PresFinance currently gracefully degrades; dedicated endpoint remains a follow-up.
- **Legacy-outbox drain is deploy step 2.5** — `scripts/drain-legacy-outbox.js` is operational, not a build artifact.

### Updated A2 deployment order (unchanged from last round)

1. Deploy functions: `syncPublicProfileOnWrite`, `getIdViewUrl`, `queueBusinessNotification`, `syncIdReviewStatus`.
2. Deploy dispatcher worker (now does Auth-record verification; requires the `firebase` scope on the service account).
3. Drain legacy outbox.
4. Backfill public_profiles.
5. Deploy client bundle (includes DriverSetup migration + ID-gate change + ManageVerifications switch).
6. Deploy rules + storage.
7. Run `scripts/revoke-id-download-tokens.js --project=… --bucket=…` dry-run → review → apply.
8. Observe one dispatcher cron cycle; verify leaderboard, rosters, protected-viewer flow, delivery to a verified vs unverified account.

### ChatGPT handoff — fourth review

Please run the harness with the project-compatible dependencies as the test gate:

```bash
firebase emulators:exec --only firestore,storage --project demo-a2 'node scripts/test-a2-rules.cjs'
```

Specific regression probes requested:
1. **F3** — write a `pending` to `/id_reviews/{uid}` AFTER an `approved` event has fired; confirm the trigger's live read returns pending and `/users.verification_status` is pending, not approved.
2. **F4** — upload a NEW `/id_reviews/{uid}` path mid-run of the revocation script; confirm the script does NOT overwrite that mapping with legacy evidence.
3. **F5** — rotate an object, replace it (new generation), rerun; confirm the ledger entry is recomputed and the new object is rotated.
4. **F6** — resubmit on a migrated+rejected row via the production `submitIdReview` service; confirm the write passes rules and the `id_tokens_migrated_at` field is untouched.
5. **F7** — change a public-mirrored field on `/users` with `updated_at` unchanged; confirm the public mirror reflects it.
6. **F8** — queue a self-notification for a user whose Firebase Auth email is NOT verified; confirm no email send and the row ends `sent` / `rejected` without a provider call.
7. **F9** — call `queuePickupToPartner` with the former-claimant 31 minutes after `released_at`; confirm `permission-denied`.

### A2 third review response (post-ChatGPT review of e78faee)

ChatGPT's third review verified R1 harness + builds green, then surfaced B1–B11 plus the unfinished ID workflow. This commit closes all twelve.

| B# | Fix | Where |
|----|-----|-------|
| **B1** Signup finalization bypass | `isSelfRestaurantSignup` tightened to `hasOnly` allowlist of changed fields. Smuggled email / id_document_front_url writes alongside restaurant_status now denied. | `firestore.rules` |
| **B2** CREATE arbitrary delivery email | `cleanCreateFields` requires `d.email.lower() == request.auth.token.email.lower()` at create. | `firestore.rules` |
| **B3** Partner UID resolution | `queueNotification.resolvePartnerUidFromPickup` reads `/restaurants/<rid>.user_id`; `pk.restaurant_user_id` only trusted when it matches. | `functions/queueNotification.js` |
| **B4** Release/handoff notification auth | Pickup rule `isSelfReleaseClaim` requires `released_by == auth.uid` and adds that field to the allowed-change list. `cancelClaim` stamps it. Callable accepts `caller == pk.released_by` / `pk.handoff_from_uid` for `to_partner` intent. | `firestore.rules`, `src/services/database.js`, `functions/queueNotification.js` |
| **B5** Global audience scopes | Callable accepts `audience_scope: 'global_bn' / 'global_restaurants' / 'global_all'` — exec-only. Client `enqueueAudienceNotification` maps `'bn' / 'restaurants' / 'all'` to those scopes. No more `chapter_id: '*'` dead query. | `functions/queueNotification.js`, `src/services/notify.js` |
| **B6** In-app bell lost in callable | `queueBusinessNotification.fanOut` batches BOTH a `/notifications` row and a `/notifications_outbox` row per recipient. | `functions/queueNotification.js` |
| **B7** Mirror race | `reconcile()` runs in `db.runTransaction()`; writes stamp a `source_rev` from `/users.updated_at`; a stale invocation whose source_rev < existing is `skipped_stale`. | `functions/lib/publicProfileProjection.js` |
| **B8** No retries on trigger | `syncPublicProfileOnWrite` declared with `.runWith({ failurePolicy: true })`. Paired with the transaction-safe reconciler. | `functions/syncPublicProfile.js` |
| **B9** Revocation clobbers newer unrotated refs | Phase 4 re-reads each user, parses the CURRENTLY stored URL, nulls only the fields whose path matches a confirmed-rotated entry. Any newer upload stays untouched; the ledger flags it as `deferred_fields`. | `scripts/revoke-id-download-tokens.js` |
| **B10** No `/id_reviews` from legacy evidence | Phase 4 constructs `/id_reviews/{uid}` with `id_front_path` / `id_back_path` / `driver_license_front_path` / `_back_path` + presence booleans + status, so `getIdViewUrl` can serve legacy users immediately. | `scripts/revoke-id-download-tokens.js` |
| **B11** Harness fails on repo-declared tooling | `fsCache` / `stCache` WeakMaps per context so repeated `ctx.firestore()` doesn't reinitialise Firestore settings on rules-unit-testing 3.0.4. | `scripts/test-a2-rules.cjs` |

### ID workflow completion

| Area | Status | Where |
|------|--------|-------|
| `id_reviews.status` → `/users.verification_status` sync | New trigger with `failurePolicy: true` + inner transaction | `functions/syncIdReviewStatus.js` + exported from `functions/index.js` |
| Legacy `authFirebase.uploadIdDocument` | Delegates to `idReview.submitIdReview`. Never writes to `/users` ID fields again. | `src/services/authFirebase.js` |
| `ManageVerifications` | Joins `/id_reviews` with `/users`. Each thumbnail resolves through `getIdViewUrl` (short-lived signed URL). Keeps a legacy-fallback renderer for the pre-migration bridge. Approve/Reject calls `setIdReviewStatus` for migrated rows, `setVerificationStatus` for legacy rows. | `src/screens/admin/ManageVerifications.js`, `src/services/idReview.js` |

### Positive-flow + regression coverage added to harness

- Positive — legitimate restaurant signup finalization succeeds (`carl` → `mine`).
- B1 regression — same finalization + email change in one update → denied.
- B1 regression — finalization + legacy ID URL in one update → denied.
- B2 regression — create with `email != token.email` → denied; matching → succeeds.
- B4 regression — self-release of own pickup with `released_by: self` succeeds; another user attempting the release → denied.
- Prior round regressions retained (R5 unverified-email deny, foreign ID path deny, nested driver, email self-redirect, outbox lockdown variants, pres cross-chapter denial, tax_receipt list, Storage ID access).

### Local verification run

- `npm ci --ignore-scripts --dry-run --no-audit --no-fund` → "up to date" (no `--legacy-peer-deps`) ✓
- `node --check` on 20 touched JS files ✓ — all parse cleanly.
- Emulator harness: still blocked on this host (no Java runtime; `brew install openjdk@17` blocked by Xcode-license wall needing sudo). Harness is syntax-clean, uses the handle-caching pattern from the review, and should pass under firebase 10.14.1 / rules-unit-testing 3.0.4. Awaiting ChatGPT's green run to independently confirm.

### Still-tracked follow-ups beyond A2

| Item | Why outside A2 |
|------|----------------|
| C1 server-side idempotent completion | Original audit flagged it; needs its own PR. |
| 25-defect items 2–8, 17–23, 25 | Reporting, receipts, event flows, HTML escaping — separate work streams. |
| Dispatcher per-row lease / full PATCH response audit | B7 retry logic landed; stricter concurrency semantics for the dispatcher itself tracked for a follow-up. |
| President-scoped donations endpoint | Current PresFinance gracefully degrades; dedicated endpoint tracked. |
| Legacy-outbox drain is deploy step 2.5 | Not a code change — operational step in `scripts/drain-legacy-outbox.js`. |

### A2 second review response (post-ChatGPT review of a219914)

ChatGPT's second review verified R1/R5/R6/R7/R10/R11 + foreign-restaurant UPDATE path AS FIXED on `a219914`, confirmed clean dependency resolution and all three deployment checks green, then surfaced seven new blockers. This section is the response to those blockers.

| ChatGPT follow-up finding | Status | Where |
|---------------------------|--------|-------|
| **#1 ID viewer arbitrary-path signing** | Fixed | `firestore.rules` `/id_reviews` block now enforces: owner-only writes must use the `cleanIdReviewOwnerFields` allowlist, every `*_path` field is pattern-matched to `id-docs/<kind>/<uid>-<side>-<digits>.<ext>` where `<uid>` is the record's own doc id, `status` can only self-transition to `pending`, reviewer fields are blocked. `functions/idViewer.js` adds defence-in-depth re-matching the exact pattern before signing. |
| **#2 Signup-time foreign restaurant_id** | Fixed | `cleanCreateFields` now blocks `restaurant_id` entirely at create. Linkage flows only through `isSelfRestaurantSignup`'s update path which calls `selfRestaurantIdOk` (exists + user_id check). |
| **#3 Notification auth mismatch** | Fixed | Client `/notifications_outbox` writes locked to self-recipient (ordinary) OR exec (admin tooling). Pres cross-chapter writes denied. New `functions/queueNotification.js` HTTPS callable validates `scope: 'pickup'|'event'|'broadcast'`, derives recipients from the operation server-side, writes outbox rows with admin SDK. Client-side `src/services/notify.js` exposes `queuePickupBroadcast`, `queuePickupToPartner`, `queuePickupToClaimant`, `queueChapterBroadcast`, `queueEventBroadcast`. All seven cross-user `enqueueNotification` sites in `src/services/database.js` migrated to the appropriate scoped helper. |
| **#4 Self-email arbitrary redirect** | Fixed | `email` added to `touchesPrivilegedFields`. A signed-in user can no longer self-rewrite their delivery address and queue a self-notification. Legit email changes must flow through exec. |
| **#5 ID split incomplete (nested driver.*)** | Fixed | `touchesNestedPrivilegedFields` compares nested `driver.license_url` / `license_front_url` / `license_back_url` old-vs-new values and denies self-writes. `cleanCreateFields` also blocks these at create time. The viewer callable in `functions/idViewer.js` and the service in `src/services/idReview.js` cover both personal and driver kinds end-to-end. |
| **#6 PresFinance blocked by fetchAllDonations** | Fixed | `src/screens/president/PresFinance.js:load` switched to `Promise.allSettled`; a denied donations fetch no longer blanks the roster/events. Flagged for a dedicated exec-scoped president-donations endpoint as a follow-up. |
| **#7 Harness fixtures missing email_verified** | Fixed | `scripts/test-a2-rules.cjs` rewritten with `verified(env, ...)` / `unverified(env, ...)` helpers. Harness adds explicit unverified-denial, path-shape, foreign-restaurant create-time, nested driver, email self-redirect, outbox lockdown, pres cross-chapter denial, and ID viewer regression cases. |

Additional work landed in this response:

- **R9 shared projector** — `functions/lib/publicProfileProjection.js` is now the single source of truth used by both the trigger (`functions/syncPublicProfile.js`) and the backfill (`scripts/backfill-public-profiles.js`). The trigger reconciles against live `/users` state (not the event's after snapshot), repairs missing mirrors, propagates deletion failures, and now rethrows on errors so Firestore retries.
- **R2+R3 revocation rewrite** — `scripts/revoke-id-download-tokens.js` now scans the ACTUAL legacy fields (top-level `id_document_*`, `driver_license_*`, `id_front_url`/`id_back_url`, nested `driver.license_*`), inventories the `id-docs/` Storage prefix for orphan files, writes a per-object ledger at `/id_token_revocation_ledger/{sha256(path)}`, requires explicit `--project` and `--bucket`, and only clears `/users` references for a user whose every path rotated successfully. Preserves evidence.

Build + install verification (local):
- `npm ci --ignore-scripts --dry-run --no-audit --no-fund` → "up to date" ✓ (no `--legacy-peer-deps`)
- `node --check` on every new/changed JS file ✓ (notify, database, publicProfiles, idReview, idViewer, queueNotification, syncPublicProfile, publicProfileProjection, backfill, revoke, drain, test-a2-rules)

Harness: still blocked on Java 17+ on this host (`java -version` fails; Homebrew install blocked by Xcode-license wall needing sudo). Harness is syntactically clean and ChatGPT previously ran it on a Java-equipped environment. Pending a green emulator run before this commit's claims can be independently confirmed.

### Not closed in this commit (deferred follow-ups)

- **ManageVerifications screen migration** to call `getIdViewUrl` + legacy `authFirebase.uploadIdDocument` migration to `idReview.submitIdReview`. Rules + callable + service in place; UI wiring is the remaining work.
- **id_reviews.status → users.verification_status sync** — a Firestore `onWrite` trigger that mirrors the authoritative review status back to `/users.verification_status` so existing eligibility gates keep working. Follow-up function.
- **Dispatcher writes** — the worker still doesn't check every Firestore PATCH response code or hold a per-row lease for concurrent dispatcher instances. The current retry changes are progress, not full idempotency.
- **President-scoped donations endpoint** — PresFinance currently gracefully degrades when exec-only `fetchAllDonations` is denied; a scoped read would restore full visibility.
- **Legacy-outbox drain** — `scripts/drain-legacy-outbox.js` ships but must run operationally at deploy step 2.5 (before dispatcher deployment can confidently say "no legacy format").
- **PresFinance CSV / name column** — audit noted the export still expects private `name`; the `public_profile.display_name` field is now populated and used in the roster render, but the CSV export columns need a sweep.

### Updated A2 deployment order

Dispatcher ships before rules lock; function + backfill before rules lock; token revocation after everything is live + the viewer UI switch is in place.

| # | Action | Why this order |
|---|--------|----------------|
| 1 | Deploy functions: `syncPublicProfileOnWrite`, `getIdViewUrl`, `queueBusinessNotification` | Trigger populates mirrors on every /users edit; callable serves the ID viewer and the authorized notification queue. All must exist before the rules lock makes them the only path. |
| 2 | Deploy dispatcher worker | Backward-compatible with any legacy outbox rows; new-format recipient resolution + per-channel retry live. |
| 2.5 | `node scripts/drain-legacy-outbox.js --dry-run` → review → run for real | Marks any pre-A2 queued row carrying `channel`/`email`/`player_id` as `rejected: legacy_format_dropped` so no legacy row ever flows through the new dispatcher. |
| 3 | `node scripts/backfill-public-profiles.js --dry-run` → review → run for real | Mint public_profiles for every existing user using the shared reconciler. |
| 4 | Deploy client bundle | Clients now read public_profiles, write new-format outbox for self, and route cross-user notifications through the callable. |
| 5 | `firebase deploy --only firestore:rules,storage` | Locks `/users` and `/id-docs` reads. Safe only once backfill + client + callable are live. |
| 6 | Deploy the ManageVerifications screen migration (follow-up PR) | Reviewer UI calls `getIdViewUrl` before step 7 invalidates all old links. |
| 7 | `node scripts/revoke-id-download-tokens.js --dry-run --project=<p> --bucket=<b>` → review → run for real | Rotates `firebaseStorageDownloadTokens` on every referenced + orphan id-docs object. Clears `/users` bearer-URL fields only after a per-object ledger confirms rotation succeeded. Preserves evidence. |
| 8 | Observe dispatcher logs for one cron cycle; verify leaderboard, rosters, volunteer count, notifications, protected-viewer flow | — |

### ChatGPT handoff — next review

Please review on branch `claude/a2-public-profiles` at the new commit above:

1. `functions/idViewer.js` + `firestore.rules` id_reviews block together — does any owner-authored path writeable by rules still reach the signer with a foreign uid?
2. `functions/queueNotification.js` — any way to make it queue to a recipient the operation's state does not justify? (unauth → `permission-denied`; writer must be pickup party or exec; recipients derived server-side)
3. `functions/lib/publicProfileProjection.js` as the shared projector + the trigger + backfill — any field in `project()` that leaks something that shouldn't be public?
4. `scripts/revoke-id-download-tokens.js` — ledger-based retry is restartable, but does the final `/users` field clear ever run when any one path failed? (should not)
5. `scripts/test-a2-rules.cjs` — any attack from the two review passes not covered?

Report the fresh 25-defect rerun + the eight new attack checks against this commit.

### A2 first review response (post-ChatGPT review of 6927f1e)

Partial — commit TBD. Status per finding:

| Finding | Status | Notes |
|---------|--------|-------|
| R1 — rules-unit-testing peer conflict | Fixed | Downgraded to `@firebase/rules-unit-testing@3.0.4` (accepts firebase ^10). `npm ci --dry-run` exits 0 without `--legacy-peer-deps`. |
| R5 — identity exceptions | Fixed | `isFounderToken()` and `readingMyLinkedAccount()` now require `request.auth.token.email_verified == true`. Full server-flow for merge discovery still queued as a follow-up (noted inline). |
| Foreign restaurant linkage | Fixed | `selfRestaurantIdOk()` now requires `exists(/restaurants/<newRid>)` AND `restaurants/<newRid>.user_id == auth.uid`. |
| R10 — legacy outbox email path | Fixed | Rules reject client-supplied `channel`/`player_id`/`email` on create and require `user_id == auth.uid` (or exec/pres). Dispatcher's legacy branch marks any such row `rejected`. `scripts/drain-legacy-outbox.js` for one-shot backlog cleanup. |
| R11 — dispatcher error handling | Fixed | Lookup now distinguishes 404 (`rejected: recipient_missing`) from 5xx (retried, max 5 attempts). Per-channel success tracked in `channels_done`; partial failures retry only the un-done side. Preference map in `src/config/notifications.js` and worker's `prefKeyForKind` consolidated and documented as paired. |
| R6 — createPickup chapter recipients | Fixed | `createPickup` now queries `/public_profiles` by `chapter_id` and filters on `role_label`. |
| R7 — president roster | Fixed | `PresReports` + `PresFinance` switched to `fetchAllPublicProfiles({ chapterId })`. Admin screens (exec-only) continue to use `fetchAllMembers`. |
| R8 — ID bearer URLs out of /users | Fixed (data model) | New `/id_reviews/{uid}` collection with its own rules (owner + exec only; presidents denied). Legacy `id_document_*`, `driver_license_*`, `id_{front,back}_url` fields added to `touchesPrivilegedFields` so no self-write can restuff them. `src/services/idReview.js` writes to the new path. Legacy upload path in `authFirebase.js:uploadIdDocument` **not yet migrated** — follow-up. |
| R4 — protected ID viewer | Function in place | `functions/idViewer.js` adds `getIdViewUrl` callable: authorizes owner OR exec via admin SDK; returns a 5-minute signed URL from the Storage path on `/id_reviews`. Review-screen UI (ManageVerifications) **not yet switched to call it** — follow-up. |
| R2 + R3 — revocation script | NOT YET done | Current `scripts/revoke-id-download-tokens.js` still has the wrong field names and the clear-on-failure bug. Blocking for production migration; non-blocking for merge if we gate on COORDINATION.md deploy step 7. |
| R9 — mirror robustness | NOT YET done | Shared projector + delete-failure propagation + stale-event guard still open. Non-blocking for merge; blocking for load. |
| CI (3 red checks) | Likely resolved by R1 | ChatGPT noted the SDK peer conflict is a deterministic install regression. New lockfile pushes next cycle; CF/Vercel re-runs will tell. If still red, inspection follow-up. |

**Not merging A2 until**: R2 + R3 (revocation script), R9 (mirror robustness), ManageVerifications switch to the viewer callable, actual harness green run (needs Java), and ChatGPT re-review of this commit.

### A2 slice details

**New collection:** `public_profiles/{uid}` — minted exclusively by the `syncPublicProfileOnWrite` Firestore trigger from an allowlist of fields on `/users`. Clients cannot write. Open read.

**Allowlist (public):** `display_name`, `chapter_id`, `avatar_url`, `lbs_rescued`, `hours_logged`, `events_attended`, `points`, `leaderboard_score`, `pickups_dropped`, `meals_rescued`, `referral_code`, `role_label` (bucketed, not raw auth role), `updated_at`.

**Deliberately excluded (never mirrored):** email, phone, DOB, age_band, guardian_*, address/city/state/zip, push_tokens, onesignal_player_id, notif_* prefs, sms_consent*, email_consent, verification_status, id_front_url, id_back_url, driver_license_*, member_status, restaurant_status, disabled, disabled_at, pending_chapter_*, chapter_request_status, signed_contracts_*, merged_into, linked_google_emails, deleted_at, raw `role`, raw `roles[]`.

**New read scope on `/users`:**
- `get`: owner, exec, president-of-same-chapter, or doc whose email/linked_google_emails matches the auth token (merge/link self-service)
- `list`: exec, or filtered by auth-token email (merge/link self-service)
- Anonymous: denied (previously allowed via isSignedIn)
- Ordinary member cross-user read: denied

**New Storage ID-doc rule:**
- Read: owner (filename prefix is their uid) OR exec (resolved via Firestore sidecar `firestore.get`)
- Write: owner only
- Previously signed-in-any read → now owner + exec only

**Consumer switches to `/public_profiles` (or scoped read):**
- `fetchLeaderboard` (src/services/database.js) — reads mirror; chapter name hydrated from `/chapters`
- `fetchEventSignups` — attendee names from mirror
- `fetchMemberOfMonth` — display name/avatar from mirror
- `WelcomeScreen` + `IrisScreen` — volunteer counts from `org_stats.volunteers` (public aggregate)
- `enqueueNotification` — client no longer resolves push_token/email; dispatcher does it with service-account creds
- `enqueueAudienceNotification` — audience filter runs against `public_profiles.role_label`
- `completePickup` receipt email — reads `/restaurants/{id}` only; `/users` fallback removed
- `verifyPickupByRestaurant` notification — volunteer name from mirror
- `findUserByReferralCode` (both `src/services/referrals.js` and `website/firebase-auth.js`) — queries mirror
- `fetchEventSignups` user hydration — mirror

**Unchanged (self-reads + exec-only reads still work under new rules):**
- `getProfile(self)`, `claimPickup(self.uid)` — self-reads
- All admin screens (ManageMembers, ManageVerifications, LiveOps, ManageChapters, ChapterApprovals, duplicates, chapterDenorm, broadcast) — exec reads
- `listAdmins` (website) — super_admin-only usage
- Google-link merge queries by own email — covered by `readingMyLinkedAccount` carve-out

**Not in this slice:**
- Dispatcher worker schema compatibility: honours pre-A2 outbox rows (channel + player_id + email already stuffed) during the drain window, resolves new rows via `/users/{uid}` server-side. One cron cycle (≤1 min) is enough to clear in-flight work.
- A2 does NOT yet revoke pre-existing Firebase Storage download tokens for ID files (see "Existing ID-link handling" below). Separate operational step.

### A2 deployment order (do not deploy until I review)

Revised ordering: the dispatcher ships **before** the Firestore rules lock, so no window exists where new-format outbox rows are being written but the old dispatcher is still live (which would silently drop them). The dispatcher is backward-compatible with pre-A2 outbox rows via the `channel` compat path, so putting it in front of the client bundle is safe.

| Step | Action | Why this order |
|------|--------|----------------|
| 1 | `cd functions && npm i && firebase deploy --only functions:syncPublicProfileOnWrite` | Trigger must exist before any new `/users` edit so the mirror stays live from the moment anyone touches their profile. |
| 2 | `cd workers/notification-dispatcher && wrangler deploy` | Dispatcher now resolves recipient contact server-side. Backward-compatible with the old outbox format (`channel` + `player_id` + `email`), so queued-but-not-sent pre-A2 rows drain cleanly. Must land **before** clients start writing new-format rows. |
| 3 | `GOOGLE_APPLICATION_CREDENTIALS=./sa.json node scripts/backfill-public-profiles.js --dry-run` | Preview: counts + non-PII sample. |
| 4 | Review dry-run output; then re-run **without** `--dry-run` | Mint `public_profiles` for every existing user. Rules in step 6 would otherwise strand leaderboards and rosters. |
| 5 | Deploy client (web + app bundle). Includes refactored `notify.js` + consumer switches | Clients now read from `public_profiles` and write new-format outbox rows the already-deployed dispatcher understands. |
| 6 | `firebase deploy --only firestore:rules,storage` | Locks `/users` and `/id-docs` reads. Safe only once backfill is complete, clients are reading the mirror, and the dispatcher is already resolving `/users` server-side via its service account. |
| 7 | `GOOGLE_APPLICATION_CREDENTIALS=./sa.json node scripts/revoke-id-download-tokens.js --dry-run` → review → run for real | **Required closure for A2.** Rotates `firebaseStorageDownloadTokens` metadata on every existing `/id-docs/*` object, which invalidates every URL already handed out. Preserves the file (evidence is kept). Clears stale `id_front_url` / `id_back_url` fields on `/users` and marks `id_front_present` / `id_back_present` so the reviewer still knows an ID was uploaded; they fetch a fresh signed URL on demand through the admin SDK. |
| 8 | Observe dispatcher logs for one cron cycle; verify leaderboard, event rosters, website volunteer count, and sample notifications | — |

**Rollback:**
- Rules commit revert → read access restores.
- `public_profiles` docs are additive, harmless if ignored.
- The function and dispatcher refactor are both safe to revert — the dispatcher still honours the pre-A2 outbox format.
- Token rotation (step 7) is **not** reversible: once a token is rotated, old URLs that depended on it are permanently invalid. By design — the whole point is to revoke them. If an exec needs the ID visually, they request a fresh download URL via the admin SDK after step 6.

### Existing ID-link revocation (required closure, not optional)

Firebase Storage download URLs carry a per-object token stored in the object's metadata (`firebaseStorageDownloadTokens`). Rules tightening in step 6 does NOT invalidate URLs already handed out. Clearing the `id_front_url` field on `/users` or re-uploading does NOT invalidate those links either — the token lives on the file, not in Firestore. Any copy of an old URL (email thread, screenshot, pasted into chat, cached in a browser) keeps working after step 6.

`scripts/revoke-id-download-tokens.js` (step 7) handles this by rotating the metadata token on every existing `/id-docs/*` object. Rotating replaces the current token with a fresh UUID; every URL carrying the old token stops working the moment the metadata update propagates. The file itself is preserved — this is deliberate so pending-review evidence isn't lost.

What the script does per user that has `id_front_url` or `id_back_url`:
1. Parse the object path from the URL (e.g. `id-docs/front/<uid>-front-123.jpg`).
2. `storage.file(path).setMetadata({ metadata: { firebaseStorageDownloadTokens: <new uuid> } })` — invalidates all prior tokens for that object.
3. Null out `id_front_url` / `id_back_url` on `/users` and set `id_{front,back}_present: true` so reviewers still know evidence exists; they fetch a fresh URL on demand.
4. Stamp `id_tokens_rotated_at` for audit.

Dry-run is required first. Verification steps post-run:
- Pick 2–3 random pre-A2 IDs; open the old URL you have on file (from an exec's email thread or an earlier screenshot). Expect `403 permission denied`.
- An exec signs in and views the Verify IDs queue; they should still see `id_{front,back}_present: true` and can click to generate a fresh download URL.
- Confirm no file was deleted (`gsutil ls -r gs://<bucket>/id-docs/ | wc -l` before and after should match).

Pending-review ownership: a volunteer whose ID is in flight at the moment of rotation can still re-upload — the upload rule is unchanged. Their new upload mints a brand-new file with its own token. The now-null `id_*_url` field gets rewritten on re-upload (owner self-update is allowed under the A2 rules).

### Harness execution — not yet run

The emulator harness in `scripts/test-a2-rules.cjs` **has not been executed yet**. The dev environment on this host does not have a Java runtime (`java -version` fails) and `firebase-tools@15.19.1` requires Java 17+. The harness is written and the `@firebase/rules-unit-testing` dependency is installed (via `--legacy-peer-deps` due to a Firebase SDK v10 vs v12 peer conflict in the project's lockfile — recorded for follow-up).

One-liner to run once Java is on PATH (JDK 17+ via Homebrew: `brew install openjdk@17`):

```bash
firebase emulators:exec --only firestore,storage --project demo-a2 'node scripts/test-a2-rules.cjs'
```

I will treat A2 as **not** closed until that command exits 0 with "all assertions passed ✓", and I expect ChatGPT to re-run its own 25-defect harness against the new rules independently. Both results belong on the PR before merge.

### Remaining risks + unverified assumptions

- `readingMyLinkedAccount` depends on `request.auth.token.email` being populated by Firebase Auth. Email/password + Google providers populate it; anonymous auth and some phone-auth setups don't. The merge/link flow is only entered by email + Google users today — confirm before trusting the carve-out for other providers.
- Firestore rules on `list` queries have strict semantics; the `where('email','==', ...)` and `where('linked_google_emails', 'array-contains', ...)` queries must satisfy the rule evaluator. Covered by one assertion in `scripts/test-a2-rules.cjs`.
- `storage.rules`' `firestore.get(...)` for the exec check runs a cross-service lookup per read; latency impact on viewing a user's ID should be negligible but confirm in staging.
- A7 (impact fabrication): inherited risk — if a user self-writes inflated totals to `/users`, the mirror propagates the inflation. Separate PR (full A7) will convert totals to validated-ledger derivations and shut this off at the source.
- Dispatcher worker refactor: compat path for pre-A2 outbox rows is in. If an old row ever landed with a missing `channel` field (pre-refactor), it now flows through the new resolver — tested only in the harness.

### ChatGPT review handoff for A2

Please review on branch `claude/a2-public-profiles` (starting commit `54cd9a5`):

1. Firestore rules diff on `/users` (now get/list split with scoped carve-outs) and the new `/public_profiles` block.
2. `functions/syncPublicProfile.js` allowlist — any field that leaked that shouldn't have?
3. `src/services/notify.js` + `workers/notification-dispatcher/src/worker.js` — the outbox contract moved recipient resolution server-side. Confirm no vector where the client controls `kind`/`title`/`body` reaches a different user than the writer intended.
4. `storage.rules` ID-doc rule — the `firestore.get(...)` sidecar for exec check.
5. `scripts/test-a2-rules.cjs` — reproduce the 25-defect harness runs against the new rules; the eight private-data assertions should now flip to "denied for other users".
6. `scripts/backfill-public-profiles.js` — safety of dry-run and the no-PII sample.

Specific defects from the audit that this slice should flip:
- #14 (another full private profile readable) → denied for non-owner/exec/pres
- #15 (anonymous receipt list) → already denied in Phase 1a, retained
- #24 (another person's ID object readable) → owner + exec only

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
