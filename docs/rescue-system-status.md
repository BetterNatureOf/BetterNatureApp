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
11. **Exclusive offers + Mapbox — done (see section below).**
12. **Still open.** Recall workflow (not implemented). Native offline banner
    (needs `@react-native-community/netinfo`). Possible double push (Expo
    `sendPushOnNotification` plus the OneSignal dispatcher) — unchecked. The Receiving
    sites form has no address search, so a site's `lat`/`lng` must be set on
    the record; without them the drop-off leg is unknown and dispatch hands
    the rescue to a coordinator (`feasibility_unknown`) instead of offering it. No coordinator button to push a donor-declined request
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

## Exclusive offers, shared policy and Mapbox (feat/rescue-offers, Nov 22)

**Policy.** `functions/lib/rescuePolicy.js` is the only place the operating
defaults live (planning defaults, not food-safety limits): one actionable
offer at a time; 5 min maximum response; 10 min loading; 10 min unloading;
5 min margin when every leg is a road estimate, 15 min when any leg is an
approximation; partners answer within 30 min (and at least 15 min before the
pickup window ends); recurring donations are confirmed 3 h before the
window starts; capacity holds lapse 30 min after the receiving deadline;
Mapbox is the routing/map provider. Tests assert these values.

**Deadline meanings (UI and server).** `pickup_by` = collection complete
(arrived and loaded). `arrival_by` = handoff complete (arrived and unloaded).
Recurring `ready_time` = when the pickup window starts.

**Trip planning.** `rescueMatching.journey` is the single planner used by
dispatch, acceptance and coordinator suggestions: volunteer → donor → wait
for readiness → load → site → wait for opening → unload, with the margin
required before each deadline (never added twice). It returns the latest
feasible start. A missing leg or deadline is `feasible: null` (never zero
minutes, never "fits"); such rescues go to a coordinator. Starting points are
the volunteer's shared H3 area, labeled approximate everywhere.

**Dispatch states.**

| `dispatch/state.status` | Meaning | Leaves when |
| --- | --- | --- |
| `searching` | One exclusive offer open, or about to be made | offer accepted → `assigned`; nobody feasible after widening → `escalated`; rescue closes → `closed` |
| `searching` + `waiting_on` | The only feasible volunteer is answering another offer | that offer resolves (retry in 2 min) |
| `assigned` | Claimed; start reminder scheduled | starts → `in_progress`; release → new generation `searching` |
| `escalated` | Coordinator decides (`no_feasible_volunteer`, `no_acceptance`, `deadline_approaching`, `destination_unusable`, `feasibility_unknown`, `donor_location_missing`) | coordinator acts |
| `closed` / `in_progress` | No longer dispatching | — |

**Offer states.** `pickups/{id}/offers/{generation}_{uid}`: `open` →
`accepted` | `declined` | `expired` | `withdrawn`. Each carries `offer_id`,
generation, round, `expires_at = min(now + 5 min, last feasible start)` with
`expiry_reason`, and the trip legs/margin used. The pickup carries
`offer_hold` (expiry only, no identity) so others see it is spoken for.
A volunteer holds at most one live offer across rescues; taking another
rescue withdraws it.

**Destination states.** `pending_destination` → partner request
(`awaiting_partner` → `accepted` | `declined` | `expired`, with donor-allowed
network fallback) or coordinator confirmation through
`confirmRescueDestination` → `available` with a saved `site_id` and a held
reservation. Reservation: `held` → `received` | `released` | `expired`
(uncollected, past expiry) | `overdue` (collected, past expiry, still counts
until a receipt, reroute or coordinator closure).

**Claim paths audited.** Client claim writes and client destination
confirmation are refused by the rules. `claimPickup` (the only client claim
service) calls `respondToRescueOffer`, which refuses: someone else's live
offer (`offered_elsewhere`), stale offer ids, expired offers, no saved site
(`no_destination`), lapsed hold (`reservation`), paused site, closed window,
safety hold, ineligible/other chapter/conflict, poor fit, busy volunteer,
missing shared area for a direct take (`area_needed`), unknown or infeasible
journey. Releases and handoffs stay pre-collection only; collected food
goes through holds and custody transfer, never back to the open pool.

**Routing.** `functions/dispatchRouting.js` exposes one provider interface:
Mapbox (Matrix for candidate comparison, batched under 25 coordinates per
request; Directions with `geometries=geojson&overview=full` for the
accepted-trip preview), OSRM (driving only, existing setups), or none.
Profiles follow the volunteer's vehicle (driving / cycling / walking; unknown
vehicles are planned as driving and flagged). Errors (missing token, 401/403,
429 with one retry, timeout, network, no route, null elements, partial
batches, malformed bodies) come back as `unavailable`/`partial` with nulls,
and callers fall back to labeled straight-line estimates. Only H3 cell
centers and stop coordinates are sent; tokens travel only in the request
and are never logged. Ordinary driving profiles are not described as
traffic-aware. `getRescueRoute` returns the route on demand (not stored).

**Maps.** `src/components/maps/RescueMap.js` (web) renders Mapbox GL JS
v3.35.0 with Mapbox Standard quieted (faded theme, no POI/transit labels, no
3D, warm land, restrained parks) when `EXPO_PUBLIC_MAPBOX_TOKEN` is set and
WebGL works; otherwise a Leaflet/OSM fallback with the same overlays,
labeled "Simplified map". Browse: clustered pickup counts, no labels per
pickup, compact selection sheet, map and list built from the same list,
selection kept across updates, "Use map center as my area" when location is
denied. Offer: both stops, no connecting line, countdown, labeled estimate.
Active: route line only from real Directions geometry, labeled "route
preview … not turn-by-turn, not live traffic"; otherwise "Road route
unavailable · stops shown without a connecting line"; Fit control; the
camera never moves on its own after someone pans; Open in Apple/Google Maps.
Native: `RescueMap.native.js` uses `@rnmapbox/maps` (config plugin added in
app.json). It needs a development/production build — not Expo Go — and
shows a plain notice with the list and addresses when the native module or
token is missing.

**Verified locally (demo-bn-rescue emulators, 375 px):** browse map with
clusters and selection sheet; exclusive offer banner for Val; Overton and
Mid-South stops in offer mode; live countdown and labeled straight-line
estimate; accept through the server (pickup `claimed_via: offer`, offer
`accepted`, `offer_hold` cleared, donor notified, dispatch `assigned`); the
other rescues skipped Val while he held the offer (found and fixed: they now
wait instead of escalating); active rescue with honest "road route
unavailable"; coordinator queue shows the legacy typed-in destination;
offline banner (found and fixed: it stretched to full height on web).

**Not verified:** Mapbox GL rendering and Mapbox routing against the real
API (no token on this machine; adapter tested with a fake fetch); native
compilation and on-device interaction; push delivery.

## Free server: rescue engine (Nov 22)

Production can't use Cloud Functions without a Google billing account, so
the server side runs on a free Cloudflare Worker, `workers/rescue-engine`
(see its README). Firebase stays on the free Spark plan (Auth, Firestore,
Storage, rules, indexes). The Worker reuses `functions/*.js` unchanged
through REST shims, serves the same callables over the Firebase callable
protocol, runs the schedule from one per-minute cron, and replaces
Firestore triggers with app pings (`pickupChanged`) plus polling of
`pickups.updated_at`, new users and activity rows, and a 6-hourly sweep.
Client pickup writes now carry `updated_at` (rules accept it only as the
server time and ignore it in transition checks). The Expo push trigger is
dropped; push and email go through the notification-dispatcher Worker.

Verified locally: all node suites pass through the REST shims; the Worker's
own tests (HTTP protocol, auth, CORS, errors, polling idempotency); the
Worker runs in Cloudflare's runtime (`wrangler dev`); browser flow on the
free stack (no Cloud Functions): coordinator confirms a site → offer → the
volunteer accepts → release → the Worker settles the hold and closes
dispatch.

## Configuration

| Setting | Where | Notes |
| --- | --- | --- |
| `EXPO_PUBLIC_MAPBOX_TOKEN` | app build env | public `pk.` token, URL/bundle-restricted |
| `MAPBOX_SERVER_TOKEN` | Functions secret | Matrix + Directions; scoped, never in the app |
| `RESCUE_ROUTING_BASE_URL` / `_TOKEN` | Functions env | optional OSRM fallback |
| `@rnmapbox/maps` plugin | app.json | native builds; `RNMAPBOX_MAPS_DOWNLOAD_TOKEN` env only if the native SDK download requires it |
| Policy numbers | functions/lib/rescuePolicy.js | change there only |

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
