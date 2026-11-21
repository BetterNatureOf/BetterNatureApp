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
| Nearby alert | `alertVolunteersOnPickupConfirmation` trigger | functions/pickupAlerts.js | one round, no tests |
| Volunteer discovery | PickupsScreen (Map/List, H3 cells) | `usePickups`, rescueCells | code only |
| Claim | PickupDetail → `claimPickup` | rules `isAtomicClaim` + `claimWindowOk` | verified (race, chapter, window) |
| Release | PickupDetail → `cancelClaim` | rules + `recordPickupRelease` ledger | verified |
| Donor confirms collection | RestDashboard / PickupDetail | rules `isRestaurantVerify` | verified |
| Hold / custody transfer / reroute / close | PickupDetail | rules + client transactions | verified (custody, close); reroute code only |
| Receiving confirmation | PickupDetail → `recordPickupReceipt` | rules `confirmsReceiving` | verified |
| Completion + receipt + impact | PickupDetail → `completePickupOperation` | functions/completePickup.js | verified (C1 suite + receipt gate) |
| Coordinator history | VolunteerHistory → `manageVolunteerHistory` | functions/volunteerHistory.js | code only |

## Gap list (priority order)

1. **Dispatch recovery.** Nearby alerts fire once, when a destination is first
   confirmed. Nothing re-alerts after a release, handoff or abandonment, widens
   the search when nobody accepts, or escalates to a coordinator before the
   deadline. The dispatch record stores only a count, so later rounds can't
   avoid duplicates. `sweepAbandonedPickups` and `releaseAbandonedPickup` have
   no caller. The C1 chapter-wide `new_pickup_broadcast` is no longer called
   (blasting every volunteer conflicts with bounded rounds).
2. **Practical matching.** `functions/rescueMatching.js` is a disconnected CLI.
   No volunteer vehicle/capacity/equipment data, no pickup food category or
   package count, and no receiving-site categories, hours or capacity exist in
   any form or collection. The optional OSRM routing interface
   (`RESCUE_ROUTING_BASE_URL`) is used only for ranking alerts.
3. **Receiving sites.** A destination is free text (name, address, contact).
   No site records with hours, pause status, contacts, capacity reservation,
   partial acceptance or rejected-food accounting.
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

## Local verification

```bash
npm run test:emulators   # every Firestore/Storage suite + registered callable suite
```

Requires Java (Homebrew `openjdk@21`) and `firebase-tools`. Uses demo projects
only (`demo-a2`, `demo-c1`, `demo-bn-*`); never production.
