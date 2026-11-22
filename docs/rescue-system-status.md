# Rescue system status

Living record of what the rescue system actually does. Slices 1–4 and the
impact reconciliation are on `main` (PR #4, merged 2026-11-21). Offers,
partner requests, recurring donations, site closures/storage and the role UX
are on `feat/rescue-offers` (cut from `origin/main` d3fad062, not pushed).
Update it whenever a slice lands. "Verified" means exercised by an emulator
test or a browser run listed below. Nothing here is deployed until the
deployment section says so.

## Branch baseline (2026-11-21)

- `origin/main` = `4962e86` (Aug 15). PRs #2 (A2) and #3 (C1) are open and
  unmerged. `claude/c1-idempotent-completion` contains Phase 1a, A2 and the
  Codex C1 fixes.
- The November rescue work was built on `main`, not on C1/A2. It is now merged
  onto the C1 line as `rescue/integration`. Where both lines solved the same
  problem, the reviewed C1/A2 version was kept.

## Normal flow and what backs each step

| Step | Entry point | Backed by | State |
| --- | --- | --- | --- |
| Donor posts surplus | ScheduleDonation → `createPickup` | rules: create as `pending_destination` | verified (delivery suite) |
| Coordinator confirms receiving site | PickupDetail → `confirmPickupDestination` | rules `isDestinationConfirm` (chapter staff or exec) | verified |
| Receiving-site account assigned | PickupDetail → `assignRescueReceiver` callable | functions/pickupReceiving.js | code only |
| Donor picks where it goes (network / preferred partner / coordinator) | ScheduleDonation → `requestReceivingPartner` | functions/partnerRequests.js | verified (8 cases + browser) |
| Partner accepts / declines before `respond_by` | Receiving screen (`/#/receiving`) → `respondToPartnerRequest` | reserve-and-confirm transaction in receivingSites.js | verified (browser) |
| Recurring donation occurrence | `materializeDonationOccurrences` (15 min), RecurringDonations → `confirmDonationOccurrence` | functions/donationSchedules.js | verified (8 cases incl. DST) |
| Bounded server offers + widening + escalation | `dispatchRescueOffer` trigger, `advanceRescueDispatch`, `closeExpiredRescueOffers` | functions/rescueDispatch.js | verified (21 cases + browser) |
| Volunteer accepts / declines an offer | PickupDetail offer banner → `respondToRescueOffer` | functions/rescueOffers.js | verified (accept race, expiry, revalidation, browser) |
| Volunteer discovery | PickupsScreen (Map/List, H3 cells) | `usePickups`, rescueCells | code only |
| Claim | PickupDetail → `claimPickup` | rules `isAtomicClaim` + `claimWindowOk` | verified (race, chapter, window) |
| Release | PickupDetail → `cancelClaim` | rules + `recordPickupRelease` ledger | verified |
| Donor confirms collection | RestDashboard / PickupDetail | rules `isRestaurantVerify` | verified |
| Hold / custody transfer / reroute / close | PickupDetail | rules + client transactions | verified (custody, close); reroute code only |
| Receiving confirmation | PickupDetail → `recordPickupReceipt` | rules `confirmsReceiving` | verified |
| Completion + receipt + impact | PickupDetail → `completePickupOperation` | functions/completePickup.js | verified (C1 suite + receipt gate) |
| Coordinator history | VolunteerHistory → `manageVolunteerHistory` | functions/volunteerHistory.js | code only |

## Gap list (priority order)

1. **Dispatch recovery — done (bd34d580, slice 1 fixes after it).** Bounded
   rounds that widen each time, a new generation after a release or abandonment
   that skips the volunteer who let go, coordinator escalation before the
   deadline, a reminder for claimants who haven't started, and a coordinator
   status card. Web deep links (`/#/pickups/<id>`, the alert URL) now open the
   rescue, including from a cold start and after signing in. Still open:
   `sweepAbandonedPickups` and `releaseAbandonedPickup` have no UI caller, and
   the C1 chapter-wide `new_pickup_broadcast` is intentionally unused.
2. **Practical matching — done (slice 2).** `functions/lib/rescueCargo.js` holds the
   shared rules (vehicle type, package and weight capacity, cooler, insulated
   bags, hand truck). The app and functions both use it. Volunteers enter vehicle
   details on Profile → Rescue vehicle; donors add food type and package count
   when posting. Dispatch skips known mismatches and still alerts when details
   are missing (counted as `cargo_unknown`). Coordinators get "Suggest
   volunteers" (callable `suggestRescueVolunteers`), which reports road time or
   distance, whether the volunteer can make the pickup cutoff, the fit, and
   `rescueMatching.evaluateRescue`'s full-trip result once every input is
   known. Gaps are listed explicitly. Stated assumptions: 10 min loading,
   10 min unloading, 10 min buffer, and volunteers free through the receiving
   deadline (no volunteer schedules exist). Road times need
   `RESCUE_ROUTING_BASE_URL` (OSRM-compatible); without it, ranking uses
   straight-line distance and timing shows as unknown.
3. **Receiving sites — done (slice 3).** `receiving_sites` records (types: staffed
   center, steward fridge, outreach partner) with weekly hours in the site's
   timezone, pause and resume, accepted food types, daily item and pound
   capacity, contacts and a designated receiver or steward. Coordinators manage
   them on Live operations → Sites (`/#/admin/sites`). Confirming against a saved
   site goes through `confirmRescueDestination`, which checks pause, hours at the
   receiving deadline, food type and remaining capacity, reserves capacity, and
   assigns the site's receiver in one transaction. Clients can't attach a site
   ID themselves. `reconcileSiteReservation` releases or settles reservations on
   cancel, reroute and receipt, including client-side paths. Receipts can record
   pounds turned away with a reason. The volunteer keeps custody, and completion
   is blocked (`remainder_pending`), until a coordinator records the remainder
   (`recordRescueRemainder`: another site with accepted pounds, returned to
   donor, composted, or discarded). Only accepted pounds count toward impact.
   Gaps: no site-level receiver assignment UI (receivers are still set per
   rescue by email or on the site record), no geocoding for site addresses (so
   no drive time to the site), and hours support one window per day.
4. **Coordinator exceptions — done (slice 4).** Rescue queue at `/#/admin/queue`
   (linked from Live operations, which also shows a "needs a decision"
   count). One list built by `functions/lib/rescueQueue.js`: on hold,
   turned-away food, dispatch escalations, late pickup, late delivery, closing
   soon, no receiving site, awaiting receipt, awaiting donor. Each row shows the
   owner of the next step, the next step and the deadline that matters, and
   updates live. Actions open the rescue (where the real services live) or
   release a no-show claim. Chapter presidents can now release no-shows (the
   rules allowed only executives before), including the variant that cancels
   once the window has passed. The released volunteer, and the donor when the
   offer closes, are notified server-side. Custody transfer candidates come from
   `listCustodyCandidates`, which fixes the A2 regression where presidents
   couldn't load the picker.
5. **Reporting — done (816c9ede, a4081a4b).** `impactLedger` counts each
   activity once and explains legacy counter differences instead of adding
   them; event check-ins use `checkin_<event>_<user>` IDs and server counters.
   Chapter reports show the verified card. Tests: tests/rules/impact.test.mjs.
6. **Server-owned offers — done (200d0c18, feat/rescue-offers).** Dispatch no
   longer broadcasts. Each round writes `pickups/{id}/offers/{gen}_{uid}` to the
   best `RESCUE_OFFER_BATCH` volunteers (default 1, max 3) for
   `RESCUE_OFFER_TTL_MIN` (default 5). H3 rings (res 7, k = 2 / 4 / 7) only
   build the shortlist; each candidate must pass eligibility, chapter, cargo
   fit, schedule conflicts and `rescueMatching.journey()` (volunteer → donor
   before cutoff → site before `arrival_by`, 10 min loading/unloading, 5 min
   buffer on road times or 15 min on the labeled approximate estimate of
   km × 1.35 at 30 km/h). Declining has no penalty and moves on at once.
   Acceptance (`respondToRescueOffer`) re-checks the offer, eligibility,
   conflicts, fit, the site reservation and the journey inside one transaction;
   a lost race returns `taken`. Widening stops when nobody is feasible and the
   coordinator is escalated with `no_feasible_volunteer` or `no_acceptance`.
   Claims and closures withdraw open offers; offer notifications are marked
   closed and dimmed in Notifications.
7. **Receiving partners — done (2e826168).** Donors choose BN network, a
   preferred partner, or "let a coordinator decide", plus whether a preferred
   partner's silence or decline may fall back to the network. The partner sees
   the request on the Receiving screen and answers before `respond_by` (default
   30 min, 10–240, never later than 15 min before the pickup window ends).
   Accepting reuses the site reserve-and-confirm transaction and only then opens
   dispatch, so recipient acceptance stays separate from driver assignment.
   Declines and expiries follow the donor's fallback choice or go to the
   coordinator queue (`awaiting_partner`). Receivers can pause/resume their site
   but cannot edit anything else on it.
8. **Recurring donations — done (fa2ea44c).** `donation_schedules` (weekdays,
   local ready time, timezone, window, end date, skip dates, food template,
   destination choice). Occurrences `donation_occurrences/{schedule}_{date}` are
   created once, up to 3 h ahead, and the donor must confirm each one (with an
   estimate) or skip it; unconfirmed ones become `missed`. Times stay at local
   wall-clock across DST. Confirmed weights are labeled `weight_basis:
   estimate` until a receipt records measured pounds.
9. **Site closures and storage — done (84dc0bc5).** Date closures
   (`closed_on_date`), storage capability (`no_cold_storage`, `no_hot_holding`,
   `storage_unknown` warning) and reservations that expire 30 min after
   `arrival_by` so stale holds stop consuming capacity. Offer acceptance
   requires the reservation to still be held.
10. **Role UX — done (6ba90f5e).** One three-step progress card (partner,
    volunteer, delivery) for donors, coordinators and receivers; the receiving
    screen offers receive-by times after the pickup window and disables times
    when the site is closed; a web offline banner says taps aren't saved.
11. **Still open.** Recall workflow (not implemented). Native offline banner
    (needs `@react-native-community/netinfo`). Possible double push (Expo
    `sendPushOnNotification` plus the OneSignal dispatcher) — unchecked. Site
    addresses aren't geocoded, so the drop-off leg is "unknown" and only the
    pickup leg is timed. The legacy client claim path is still allowed by rules
    for unsited rescues. No coordinator button to push a donor-declined request
    to the network. No site-level receiver assignment UI. Recurring donations
    not yet run in a browser. Native push, location and deep links not checked
    on a device.

### Reference sources and what came from them

- Clean Memphis Project Green Fork page: no matching, dispatch or
  certification details to draw on; nothing was taken from it, and the app
  never implies certification by or affiliation with Clean Memphis.
- 2023 annual report PDF: too large to read in this session (>10 MB); nothing
  is based on it.
- Uber H3 blog post: documents hexagonal indexing for analysis. BN uses H3 only
  for the nearby shortlist; the offer sequence, timeouts, widening and
  feasibility rules are BN decisions, not Uber's dispatch algorithm.

Known A2 trade-offs to keep in mind: signed-out visitors can no longer queue
outbox email (StartChapter receipt email fails quietly). Cross-user
notifications must go through `queueBusinessNotification` or server code.

## Browser flows run (emulators, 375 px wide)

- Coordinator confirms a receiving site, which opens the offer. Round 1 alerts
  the nearby volunteer and the status card updates live.
- Volunteer cold-opens the alert URL, sees the confirmed site, accepts, and the
  active-run view loads.
- Volunteer releases: generation `release_*` starts with that volunteer
  excluded, and the release ledger records the drop.
- Signed-out cold open of an escalated rescue, then sign in, lands on the
  rescue with the "Needs your decision" card.
- President dashboard (LiveOps) loads: names come from public profiles and
  timestamps render.
- Coordinator "Suggest volunteers" on an open rescue lists Val with distance,
  "Travel time unknown · Vehicle fit unknown", and the not-yet-known list.
- Add vehicle (SUV, cooler) from the rescue → saved under the real rules →
  back on the rescue the line reads "Fits your vehicle".
- Receiving sites screen shows open, paused and hours-unknown states. Picking
  the fridge for cold food is refused in plain language; picking the pantry
  opens the offer, holds the reservation and assigns the pantry receiver. The
  pantry receiver records 20 lb accepted and 10 lb turned away; the coordinator
  records 6 lb taken by the Cooper St fridge; the volunteer completes and 26 lb
  is recorded with a receipt.
- Rescue queue shows an escalation, an unsited offer and a pending receipt; a
  claimed rescue past its cutoff appears live as "Late · 5 min overdue" and is
  released as a no-show, which cancels it because its window had passed. A held,
  collected run loads eligible replacements through the callable and the
  president records the custody transfer.

- feat/rescue-offers, demo-bn-rescue stack: donor posts produce (3 items) to
  preferred partner Mid-South Pantry with network fallback → the pantry
  receiver sees it on Receiving, a too-early time is refused (pickup cutoff),
  a closed time is disabled, accepting confirms the site and reserves
  capacity → dispatch offers Val only (Vic skipped as busy) with an
  approximate trip and unknown drop-off leg → Val sees the offer banner and
  accepts → pickup `claimed_via: offer`, offer `accepted`, dispatch `assigned`.

## Configuration

| Setting | Default | Notes |
| --- | --- | --- |
| `RESCUE_OFFER_BATCH` | 1 | volunteers offered at once, 1–3 |
| `RESCUE_OFFER_TTL_MIN` | 5 | minutes to answer an offer |
| `RESCUE_ROUTING_BASE_URL` / `_TOKEN` | unset | OSRM-compatible; unset = labeled approximate times |
| partner `respondWithinMin` | 30 | 10–240, capped 15 min before pickup window ends |
| recurring lead time | 3 h | `LEAD_MS` in donationSchedules.js |
| reservation expiry | arrival_by + 30 min | receivingSites.js |

## Local verification

```bash
npm run test:emulators   # every Firestore/Storage suite + registered callable suite
```

Requires Java (Homebrew `openjdk@21`) and `firebase-tools`. Uses demo projects
only (`demo-a2`, `demo-c1`, `demo-bn-*`); never production. Tests use the ports
in `firebase.test-ports.json`, so they can run while the dev emulators are up.

Browser tip: other preview tabs on `localhost:8081` share Firebase auth storage
with yours (signing in or out in one affects the other). Use
`http://127.0.0.1:8081` for an isolated session.

Manual browser testing: `npm run emulators`, then `npm run seed:emulators`,
then `npm run web:emulators` (or the "Expo Web (emulators)" launch config).
A second isolated stack (project `demo-bn-rescue`, firebase.dev2.json) runs
with `npm run emulators:alt`, `seed:emulators:alt`, `web:emulators:alt`.
Demo accounts are `*@demo.betternature.test`; the password is in
`scripts/seed-emulator.cjs`.
