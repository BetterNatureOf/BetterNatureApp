# Rescue system status

Living record of what the rescue system actually does, based on the code on
`rescue/integration` (C1/A2 line + November IRIS work, merged 2026-11-21).
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
| Nearby alert rounds + escalation | `dispatchRescueOffer` trigger, `advanceRescueDispatch` scheduler | functions/rescueDispatch.js | verified (12 emulator cases + browser) |
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
4. **Coordinator exceptions.** Actions exist only per pickup inside
   PickupDetail. LiveOps lists awaiting-destination and active rescues. There is
   no single queue for unassigned, near-deadline, late, held or
   awaiting-confirmation rescues. Under A2 rules, presidents can't list `/users`,
   so `fetchCustodyVolunteers` (custody picker) fails; it needs a callable.
5. **Reporting.** C1 completion writes the activity, totals and org_stats once.
   Legacy profile totals, manual history entries and event check-ins are not
   reconciled against activity rows.
6. **Offline and native.** There is no connectivity or save-status feedback and
   no draft recovery. Native push, location and deep links have not been
   checked on a device.
7. **Recall.** Not implemented.

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
Demo accounts are `*@demo.betternature.test`; the password is in
`scripts/seed-emulator.cjs`.
