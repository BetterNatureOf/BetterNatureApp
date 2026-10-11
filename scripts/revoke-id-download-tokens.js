#!/usr/bin/env node
/**
 * A2 — revoke Firebase Storage download tokens on existing ID files
 * AND migrate the surviving references into /id_reviews/{uid} so the
 * protected `getIdViewUrl` callable can serve them going forward.
 *
 * Preserves every file. Rotates `firebaseStorageDownloadTokens`
 * metadata to a fresh UUID so every URL carrying the old token
 * stops working server-side.
 *
 * B9 — the final /users clear now only nulls fields whose CURRENTLY
 * STORED URL still resolves to a path we rotated. A concurrent new
 * upload during the rotation phase leaves a URL pointing to an
 * un-rotated path; that URL is left alone and the migration log
 * flags the user for a retry pass.
 *
 * B10 — for each legacy user with ID evidence, this script writes
 * /id_reviews/{uid} with the resolved personal/driver + front/back
 * paths. getIdViewUrl requires those mappings; without this step
 * reviewers lose access to legacy IDs even after rules deploy.
 *
 * USAGE
 *   node scripts/revoke-id-download-tokens.js --dry-run \
 *     --project=better-nature-app --bucket=better-nature-app.appspot.com
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=./sa.json \
 *     node scripts/revoke-id-download-tokens.js \
 *     --project=better-nature-app --bucket=better-nature-app.appspot.com
 *
 * Idempotent + restartable: ledger entries at
 *   /id_token_revocation_ledger/{sha256(path)}
 * record `status: rotated | missing | error` plus Storage object
 * generation. A re-run skips entries already in `rotated` only if
 * the Storage generation hasn't advanced (new upload).
 */

const admin = require('firebase-admin');
const crypto = require('crypto');

const DRY_RUN = process.argv.includes('--dry-run');
const argMap = Object.fromEntries(
  process.argv.filter((a) => a.startsWith('--')).map((a) => a.replace(/^--/, '').split('='))
);
const PROJECT = argMap.project || '';
const BUCKET = argMap.bucket || '';

const TOKEN_META_KEY = 'firebaseStorageDownloadTokens';
const LEDGER_COLLECTION = 'id_token_revocation_ledger';

const TOP_LEVEL_URL_FIELDS = [
  'id_document_url', 'id_document_front_url', 'id_document_back_url',
  'driver_license_url', 'driver_license_front_url', 'driver_license_back_url',
  'id_front_url', 'id_back_url',
];
const NESTED_DRIVER_FIELDS = ['license_url', 'license_front_url', 'license_back_url'];

function newToken() { return crypto.randomUUID(); }
function pathHash(p) {
  return crypto.createHash('sha256').update(p).digest('hex').slice(0, 32);
}

function parseStoragePath(url) {
  if (!url || typeof url !== 'string') return null;
  const m = /\/o\/([^?]+)/.exec(url);
  if (!m) return null;
  try { return decodeURIComponent(m[1]); } catch { return null; }
}

// Infer kind/side from a legacy path. Example paths:
//   id-docs/personal/<uid>-front-<ts>.jpg
//   id-docs/driver/<uid>-back-<ts>.jpg
//   id-docs/<uid>-front-<ts>.jpg          (very old)
function inferKindAndSide(path) {
  const parts = path.split('/');
  let kind = 'personal';
  if (parts.length >= 3) {
    const k = parts[1];
    if (k === 'driver' || k === 'personal') kind = k;
  }
  const name = parts[parts.length - 1] || '';
  const side = /-back-/.test(name) ? 'back' : /-front-/.test(name) ? 'front' : null;
  return { kind, side };
}
// G5 — the protected signer only accepts paths that match
//   id-docs/<kind>/<uid>-<side>-<digits>.<ext>
// where <kind> ∈ {personal, driver}, <side> ∈ {front, back},
// <ext> ∈ {jpg, jpeg, png}, and <uid> is EXACTLY the owner's uid.
// Very old uploads were saved as `id-docs/<uid>-<side>-<ts>.jpg`
// (no kind segment); the signer rejects those. If we clear the
// legacy /users URL for such a path, the evidence becomes
// unreachable. The revocation script therefore refuses to clear
// a legacy reference whose current path is non-canonical AND
// leaves an explicit entry in the ledger so operators can decide
// how to canonicalize it later.
function canonicalPathOk(path, uid, kind, side) {
  if (!path || !uid || !kind || !side) return false;
  const escUid = String(uid).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('^id-docs/' + kind + '/' + escUid + '-' + side + '-[0-9]+\\.(jpe?g|png)$');
  return re.test(path);
}

function fieldForReview(kind, side) {
  if (kind === 'driver')  return side === 'back' ? 'driver_license_back_path' : 'driver_license_front_path';
  return side === 'back' ? 'id_back_path' : 'id_front_path';
}
function presentFieldForReview(kind, side) {
  if (kind === 'driver')  return side === 'back' ? 'driver_license_back_present' : 'driver_license_front_present';
  return side === 'back' ? 'id_back_present' : 'id_front_present';
}

function collectReferencedPaths(u) {
  // Return a map { fieldLabel -> path } so the final clear step can
  // decide per-field whether to null it based on which path(s) got
  // rotated. Nested driver fields are tagged `driver.<name>`.
  const refs = {};
  for (const k of TOP_LEVEL_URL_FIELDS) {
    const p = parseStoragePath(u?.[k]);
    if (p && p.startsWith('id-docs/')) refs[k] = p;
  }
  const drv = u?.driver || {};
  for (const k of NESTED_DRIVER_FIELDS) {
    const p = parseStoragePath(drv[k]);
    if (p && p.startsWith('id-docs/')) refs[`driver.${k}`] = p;
  }
  return refs;
}

async function rotateOne(bucket, path, ledgerRef) {
  const file = bucket.file(path);
  const [exists] = await file.exists();
  if (!exists) {
    if (!DRY_RUN) await ledgerRef.set({
      path, status: 'missing',
      ts: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return { status: 'missing' };
  }
  if (DRY_RUN) return { status: 'would_rotate' };
  const [meta] = await file.getMetadata();
  const newTok = newToken();
  const observedMetageneration = meta.metageneration;
  // H4 — Storage precondition. If the object's metageneration
  // changed between our read and this write (another process
  // mutated metadata — unlikely under the migration lock but
  // belt-and-suspenders), the write fails and we don't trust the
  // ledger entry.
  await file.setMetadata(
    { metadata: { ...(meta.metadata || {}), [TOKEN_META_KEY]: newTok } },
    { ifMetagenerationMatch: observedMetageneration },
  );
  // F5 — record BOTH the Storage generation AND the token we wrote.
  // A later run cross-checks live metadata against these before
  // trusting a ledger entry's `rotated` status.
  const generation = meta.generation || null;
  await ledgerRef.set({
    path, status: 'rotated',
    generation,
    rotated_token: newTok,
    rotated_at: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  return { status: 'rotated', generation, token: newTok };
}

// F5 + G4 — verify a prior ledger entry still describes the live
// object. Returns a structured outcome: `ok` only when BOTH the
// recorded generation AND the recorded token are present AND match
// current live Storage metadata. An incomplete legacy ledger entry
// (no generation / no token) is `incomplete`; a mismatched entry is
// `superseded`. Phase 3 re-rotates both; Phase 4 refuses to clear
// a reference whose live state is `superseded`.
async function ledgerStatus(bucket, path, ledgerData) {
  if (!ledgerData || ledgerData.status !== 'rotated') return { kind: 'absent' };
  if (!ledgerData.generation || !ledgerData.rotated_token) {
    return { kind: 'incomplete' };
  }
  try {
    const file = bucket.file(path);
    const [exists] = await file.exists();
    if (!exists) return { kind: 'missing' };
    const [meta] = await file.getMetadata();
    const liveGen = meta.generation || null;
    const liveTok = (meta.metadata || {})[TOKEN_META_KEY] || null;
    if (String(ledgerData.generation) !== String(liveGen)) return { kind: 'superseded', liveGen, liveTok };
    if (liveTok !== ledgerData.rotated_token) return { kind: 'superseded', liveGen, liveTok };
    return { kind: 'ok', liveGen, liveTok };
  } catch (e) { return { kind: 'error', message: e?.message }; }
}

async function main() {
  if (!PROJECT) { console.error('Missing --project=<firebase-project-id>'); process.exit(2); }
  if (!BUCKET)  { console.error('Missing --bucket=<storage-bucket>'); process.exit(2); }
  if (!admin.apps.length) admin.initializeApp({ projectId: PROJECT, storageBucket: BUCKET });
  const db = admin.firestore();
  const bucket = admin.storage().bucket(BUCKET);

  console.log(`[A2 revoke] mode=${DRY_RUN ? 'DRY-RUN' : 'WRITE'} project=${PROJECT} bucket=${BUCKET}`);

  // H4 — write-barrier lock. Storage rules deny all id-docs/* uploads
  // while this Firestore doc exists, so no new upload can replace a
  // path we're mid-rotating. Removed in the finally{} after Phase 4.
  const lockRef = db.doc('migration_locks/id_docs_rotation');
  let lockAcquired = false;
  if (!DRY_RUN) {
    const prior = await lockRef.get();
    if (prior.exists) {
      console.error('[A2 revoke] another migration lock is already held; abort.');
      process.exit(2);
    }
    await lockRef.set({
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      script: 'revoke-id-download-tokens.js',
      project: PROJECT, bucket: BUCKET,
    });
    lockAcquired = true;
  }
  try {

  // Phase 1 — scan /users, collect per-user references.
  // H5 preflight — split REFERENCED paths into canonical vs
  // non-canonical PER OWNER. Canonical paths continue through
  // Phase 3 rotation + Phase 4 clear. Non-canonical referenced
  // paths are flagged, NOT rotated, and their /users references
  // stay intact so reviewers keep whatever access the old bearer
  // URL still provides until an operator canonicalizes them. The
  // final exit code is non-zero while any remain.
  const perUserRefs = new Map();
  const referencedPaths = new Set();
  const nonCanonicalReferenced = []; // {uid, label, path}
  const usersSnap = await db.collection('users').get();
  for (const d of usersSnap.docs) {
    const refs = collectReferencedPaths(d.data());
    if (!Object.keys(refs).length) continue;
    const canonicalRefs = {};
    for (const [label, path] of Object.entries(refs)) {
      const { kind, side } = inferKindAndSide(path);
      if (side && canonicalPathOk(path, d.id, kind, side)) {
        canonicalRefs[label] = path;
        referencedPaths.add(path);
      } else {
        nonCanonicalReferenced.push({ uid: d.id, label, path });
      }
    }
    if (Object.keys(canonicalRefs).length) perUserRefs.set(d.id, canonicalRefs);
  }

  // Phase 2 — Storage prefix inventory for orphans.
  const [storageFiles] = await bucket.getFiles({ prefix: 'id-docs/' });
  const storagePaths = new Set(storageFiles.map((f) => f.name));
  const orphans = [...storagePaths].filter((p) => !referencedPaths.has(p));

  console.log(`[inventory] users_with_refs=${perUserRefs.size} referenced=${referencedPaths.size} storage=${storagePaths.size} orphans=${orphans.length}`);

  // Phase 3 — rotate every path we discovered. Record ledger.
  const perObject = { rotated: 0, missing: 0, would_rotate: 0, errors: 0 };
  const rotatedPaths = new Set();  // only paths our rotation confirmed
  const allPaths = new Set([...referencedPaths, ...orphans]);
  // rotationState: path -> { generation, token } observed when we
  // confirmed rotation. Phase 4 cross-checks live Storage against
  // this before clearing /users references (G4 — guards against
  // an object replacement that happens between rotation and clear).
  const rotationState = new Map();
  for (const p of allPaths) {
    const ledgerRef = db.collection(LEDGER_COLLECTION).doc(pathHash(p));
    try {
      const prior = await ledgerRef.get();
      // F5 + G4 — only trust a ledger entry whose stored generation
      // AND stored token match live Storage. Incomplete legacy
      // entries (no generation / no token) always re-rotate.
      const status = prior.exists && !DRY_RUN
        ? await ledgerStatus(bucket, p, prior.data())
        : { kind: 'absent' };
      if (status.kind === 'ok') {
        rotatedPaths.add(p);
        rotationState.set(p, { generation: status.liveGen, token: status.liveTok });
        perObject.rotated += 1;
        continue;
      }
      const r = await rotateOne(bucket, p, ledgerRef);
      if (r.status === 'rotated') {
        rotatedPaths.add(p);
        rotationState.set(p, { generation: r.generation, token: r.token });
        perObject.rotated += 1;
      }
      else if (r.status === 'missing') perObject.missing += 1;
      else perObject.would_rotate += 1;
    } catch (e) {
      perObject.errors += 1;
      console.warn('rotate failed', p, e?.message);
      if (!DRY_RUN) {
        try { await ledgerRef.set({ path: p, status: 'error', error: e?.message || 'unknown', ts: admin.firestore.FieldValue.serverTimestamp() }, { merge: true }); } catch {}
      }
    }
  }

  // Phase 4 — mint /id_reviews/{uid} for legacy users (B10) AND
  // conditionally clear /users bearer-URL fields (B9).
  //
  // B9 — before clearing a field, re-read the user and compare the
  // CURRENTLY stored URL's path against our confirmed rotatedPaths.
  // Only null the field when the current path matches. A newer
  // upload done concurrently with Phase 3 leaves a different path;
  // we leave that field alone and the ledger flags it for retry.
  const userUpdates = {
    attempted: 0, cleared_fields: 0, deferred_fields: 0,
    reviews_minted: 0, errors: 0,
  };

  if (!DRY_RUN) {
    for (const [uid, _origRefs] of perUserRefs) {
      userUpdates.attempted += 1;
      try {
        // G4 — before committing, re-verify each path's live
        // Storage state matches the rotation state we recorded. If
        // the object was replaced AFTER rotation (new generation
        // or new token), its CURRENT bearer URL is unrevoked and
        // we must defer clearing. Done OUTSIDE the Firestore
        // transaction because Storage reads can't live inside a
        // Firestore tx, and committed counters must not be
        // double-counted on tx retry.
        const userRef   = db.doc(`users/${uid}`);
        const reviewRef = db.doc(`id_reviews/${uid}`);
        const freshSnap = await userRef.get();
        if (!freshSnap.exists) continue;
        const u = freshSnap.data();
        const currentRefs = collectReferencedPaths(u);
        // Confirm each currently-referenced path is still in the
        // rotation state we captured + live Storage still agrees.
        const confirmedPaths = new Set();
        for (const [, path] of Object.entries(currentRefs)) {
          if (!rotatedPaths.has(path)) continue;
          const rec = rotationState.get(path);
          if (!rec) continue;
          try {
            const [exists] = await bucket.file(path).exists();
            if (!exists) continue;
            const [meta] = await bucket.file(path).getMetadata();
            const liveGen = meta.generation || null;
            const liveTok = (meta.metadata || {})[TOKEN_META_KEY] || null;
            if (String(rec.generation) !== String(liveGen)) continue;
            if (rec.token !== liveTok) continue;
            confirmedPaths.add(path);
          } catch { /* defer */ }
        }

        let mintedThisUser = 0, clearedThisUser = 0, deferredThisUser = 0;
        await db.runTransaction(async (tx) => {
          const [uSnap, rSnap] = await Promise.all([tx.get(userRef), tx.get(reviewRef)]);
          if (!uSnap.exists) return;
          const live = uSnap.data();
          const existingReview = rSnap.exists ? (rSnap.data() || {}) : null;
          const txRefs = collectReferencedPaths(live);
          const reviewUpdate = {};
          const userClear = {};
          mintedThisUser = 0; clearedThisUser = 0; deferredThisUser = 0;

          for (const [label, currentPath] of Object.entries(txRefs)) {
            if (!confirmedPaths.has(currentPath)) {
              deferredThisUser += 1;
              continue;
            }
            const { kind, side } = inferKindAndSide(currentPath);
            if (!side) { deferredThisUser += 1; continue; }
            // G5 — the signer only accepts canonical paths. If this
            // reference doesn't match the canonical shape for its
            // uid + kind + side, do NOT clear it and do NOT mint
            // the mapping (it would be unreachable through
            // getIdViewUrl). Deferred; a separate pass will decide
            // whether to canonicalize those objects.
            if (!canonicalPathOk(currentPath, uid, kind, side)) {
              deferredThisUser += 1;
              continue;
            }
            const pathField    = fieldForReview(kind, side);
            const presentField = presentFieldForReview(kind, side);
            const reviewAlreadyHasPath = existingReview && existingReview[pathField];
            if (reviewAlreadyHasPath) {
              deferredThisUser += 1;
            } else {
              reviewUpdate[pathField] = currentPath;
              reviewUpdate[presentField] = true;
            }
            if (label.startsWith('driver.')) {
              userClear[`driver.${label.slice('driver.'.length)}`] = null;
            } else {
              userClear[label] = null;
            }
          }

          const mintedAny = Object.keys(reviewUpdate).length > 0;
          if (mintedAny) {
            const payload = {
              ...reviewUpdate,
              id_tokens_migrated_at: admin.firestore.FieldValue.serverTimestamp(),
            };
            if (!existingReview || !existingReview.status) {
              payload.status = live.verification_status || 'pending';
              payload.uploaded_at = live.verification_submitted_at
                ? live.verification_submitted_at
                : admin.firestore.FieldValue.serverTimestamp();
            }
            tx.set(reviewRef, payload, { merge: true });
            mintedThisUser += 1;
          }

          const clearedKeys = Object.keys(userClear);
          if (clearedKeys.length) {
            userClear.id_tokens_rotated_at = admin.firestore.FieldValue.serverTimestamp();
            tx.update(userRef, userClear);
            clearedThisUser += clearedKeys.length;
          }
        });
        // G4 — count OUTSIDE the transaction callback. On a retry
        // the callback runs again; incrementing inside would double-
        // count. We only tally once the commit returned.
        userUpdates.reviews_minted   += mintedThisUser;
        userUpdates.cleared_fields   += clearedThisUser;
        userUpdates.deferred_fields  += deferredThisUser;
      } catch (e) {
        userUpdates.errors += 1;
        console.warn('user migrate failed', uid, e?.message);
      }
    }
  }

  // H5 — the full validator identifies non-canonical references
  // during Phase 1 (preflight). The output surfaces the EXACT per-
  // user path triples (uid, label, path) rather than just the prefix
  // check, and exits non-zero while any remain unresolved. Those
  // objects were NOT rotated and their /users bearer URL is still
  // live — the migration is explicitly INCOMPLETE until an operator
  // canonicalizes or confirms production has none.
  console.log(JSON.stringify({
    project: PROJECT, bucket: BUCKET,
    mode: DRY_RUN ? 'DRY-RUN' : 'WRITE',
    per_object: perObject,
    users: userUpdates,
    orphans_rotated: orphans.length,
    non_canonical_referenced: nonCanonicalReferenced,
  }, null, 2));
  if (nonCanonicalReferenced.length > 0) {
    console.error(`[A2 revoke] ${nonCanonicalReferenced.length} non-canonical reference(s) unresolved; migration INCOMPLETE.`);
    process.exit(3);
  }
  if (perObject.errors > 0 || userUpdates.errors > 0) process.exit(2);
  } finally {
    if (lockAcquired) {
      try { await lockRef.delete(); } catch (e) { console.warn('[A2 revoke] failed to release lock:', e?.message); }
    }
  }
}

main().catch((e) => { console.error('[A2 revoke] failed', e); process.exit(1); });
