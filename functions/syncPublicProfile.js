// Firestore trigger: mirror /users/{uid} → /public_profiles/{uid}
// with a strict allowlist.
//
// R9 — rewritten to use the shared projector in lib/publicProfileProjection.js
// so the backfill script and this trigger can never drift. The trigger
// now:
//   • reconciles against the CURRENT /users state (via `reconcile`)
//     rather than blindly writing change.after. A delayed create event
//     applied after a delete used to resurrect the public mirror; now
//     the reconciler reads live state and does the right thing.
//   • propagates deletion failures. The old handler swallowed every
//     error from the delete path; a transient quota or 5xx would leave
//     a stale public row forever. The trigger now rethrows so Firestore
//     retries.
//   • handles the "mirror disappeared but source exists" case: a
//     private-field edit that didn't change any public-visible field
//     still repairs the mirror if the destination doc is missing.
//
// See firestore.rules /public_profiles block — clients can't write
// here, so this function is the single writer outside of
// scripts/backfill-public-profiles.js (which uses admin SDK and the
// same reconciler).

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { reconcile } = require('./lib/publicProfileProjection');

// B8 — background Cloud Functions do NOT retry by default. Without
// `failurePolicy: true` the trigger's rethrow just logs an error
// and the mirror diverges silently. Opting in to retries pairs with
// the idempotent, transaction-safe `reconcile()` below. Firebase
// bounds retries to roughly 7 days; projection work must be purely
// a function of /users state so repeated retries never over-count.
// Reference: https://firebase.google.com/docs/functions/retries
exports.syncPublicProfileOnWrite = functions
  .runWith({ failurePolicy: true })
  .firestore
  .document('users/{uid}')
  .onWrite(async (change, context) => {
    const uid = context.params.uid;
    // R9 — reconcile against live /users state instead of relying on
    // the event's after snapshot. Rethrows on failure so Firestore
    // retries the trigger (default retry policy applies).
    try {
      const result = await reconcile(admin.firestore(), uid);
      if (process.env.FUNCTIONS_EMULATOR) console.log('[syncPublicProfile]', uid, result);
    } catch (e) {
      console.error('[syncPublicProfile] reconcile failed', uid, e?.message);
      throw e;
    }
    return null;
  });
