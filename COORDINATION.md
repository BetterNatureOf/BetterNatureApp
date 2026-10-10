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

| Step | Action | Why this order |
|------|--------|----------------|
| 1 | `cd functions && npm i && firebase deploy --only functions:syncPublicProfileOnWrite` | Trigger must exist before any new `/users` edit so mirror stays live |
| 2 | `GOOGLE_APPLICATION_CREDENTIALS=./sa.json node scripts/backfill-public-profiles.js --dry-run` | Preview: counts + non-PII sample |
| 3 | Review dry-run output; then re-run **without** `--dry-run` | Mint `public_profiles` for every existing user — rules in step 5 would otherwise strand leaderboards |
| 4 | Deploy client (web + app bundle). Includes refactored notify.js + consumer switches | Clients read from `public_profiles` before `/users` reads get locked |
| 5 | `firebase deploy --only firestore:rules,storage` | Locks `/users` and `id-docs` reads. Only safe once backfill is complete and clients are reading the mirror |
| 6 | `cd workers/notification-dispatcher && wrangler deploy` | Dispatcher now resolves recipient contact server-side |
| 7 | Observe dispatcher logs for one cron cycle; verify leaderboard, event rosters, and website volunteer count render |

**Rollback:** revert the `firestore.rules` and `storage.rules` commit → read access restores. The `public_profiles` docs are additive and harmless if ignored. The function and the dispatcher refactor are also safe to revert (dispatcher still honours old-schema outbox docs).

### Existing ID-link handling (not auto-revoked)

Firebase Storage download URLs carry a per-object token that survives rules tightening. Deploying step 5 does NOT revoke links already handed out. Required operational cleanup:

1. For every user whose `/users/<uid>.verification_status == 'pending'`, exec contacts them to re-upload ID. The re-upload writes to a new filename (new token), and the exec clears the stale `id_front_url` / `id_back_url` fields.
2. For `verification_status == 'approved'`, we optionally delete the Storage object (ID is no longer needed) through the admin SDK. Not a security-critical path but worth doing — a reviewer can be prompted to delete after approval.
3. For `verification_status == 'rejected'`, same as approved — delete the object.
4. No exposure change for `verification_status in [null, 'none']` (no ID was ever uploaded).

I will NOT run this cleanup — it needs admin tooling that reads `/users` with the service account and can call Storage delete. Separate task; coordinate with ChatGPT.

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
