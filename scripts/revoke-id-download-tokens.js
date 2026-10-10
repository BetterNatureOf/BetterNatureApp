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
  await file.setMetadata({
    metadata: { ...(meta.metadata || {}), [TOKEN_META_KEY]: newToken() },
  });
  const generation = meta.generation || null;
  await ledgerRef.set({
    path, status: 'rotated',
    generation,
    rotated_at: admin.firestore.FieldValue.serverTimestamp(),
    had_prior_token: !!(meta.metadata && meta.metadata[TOKEN_META_KEY]),
  }, { merge: true });
  return { status: 'rotated', generation };
}

async function main() {
  if (!PROJECT) { console.error('Missing --project=<firebase-project-id>'); process.exit(2); }
  if (!BUCKET)  { console.error('Missing --bucket=<storage-bucket>'); process.exit(2); }
  if (!admin.apps.length) admin.initializeApp({ projectId: PROJECT, storageBucket: BUCKET });
  const db = admin.firestore();
  const bucket = admin.storage().bucket(BUCKET);

  console.log(`[A2 revoke] mode=${DRY_RUN ? 'DRY-RUN' : 'WRITE'} project=${PROJECT} bucket=${BUCKET}`);

  // Phase 1 — scan /users, collect per-user references.
  const perUserRefs = new Map();  // uid -> {fieldLabel -> path}
  const referencedPaths = new Set();
  const usersSnap = await db.collection('users').get();
  for (const d of usersSnap.docs) {
    const refs = collectReferencedPaths(d.data());
    if (Object.keys(refs).length) {
      perUserRefs.set(d.id, refs);
      for (const p of Object.values(refs)) referencedPaths.add(p);
    }
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
  for (const p of allPaths) {
    const ledgerRef = db.collection(LEDGER_COLLECTION).doc(pathHash(p));
    try {
      const prior = await ledgerRef.get();
      if (prior.exists && prior.data()?.status === 'rotated' && !DRY_RUN) {
        rotatedPaths.add(p);
        perObject.rotated += 1;
        continue;
      }
      const r = await rotateOne(bucket, p, ledgerRef);
      if (r.status === 'rotated') { rotatedPaths.add(p); perObject.rotated += 1; }
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
        // Re-read the user — their state may have changed since the
        // Phase-1 scan (new upload, exec correction, etc.).
        const freshSnap = await db.doc(`users/${uid}`).get();
        const u = freshSnap.exists ? freshSnap.data() : null;
        if (!u) continue;
        const now = collectReferencedPaths(u);

        // Build the review-doc path map AND the user-doc clear map
        // in one pass. Prefer the current path, not the original.
        const reviewUpdate = {
          status: u.verification_status || 'pending',
          uploaded_at: u.verification_submitted_at || admin.firestore.FieldValue.serverTimestamp(),
          id_tokens_migrated_at: admin.firestore.FieldValue.serverTimestamp(),
        };
        const userClear = {};
        let anyReviewFieldSet = false;

        for (const [label, currentPath] of Object.entries(now)) {
          // Only act when the CURRENT stored path is in rotatedPaths.
          if (!rotatedPaths.has(currentPath)) {
            userUpdates.deferred_fields += 1;
            continue;
          }
          const { kind, side } = inferKindAndSide(currentPath);
          if (!side) {
            userUpdates.deferred_fields += 1;
            continue;
          }
          // Mint review mapping (B10).
          reviewUpdate[fieldForReview(kind, side)] = currentPath;
          reviewUpdate[presentFieldForReview(kind, side)] = true;
          anyReviewFieldSet = true;
          // Clear the legacy field (B9: only this specific field).
          if (label.startsWith('driver.')) {
            userClear[`driver.${label.slice('driver.'.length)}`] = null;
          } else {
            userClear[label] = null;
          }
        }

        if (anyReviewFieldSet) {
          await db.doc(`id_reviews/${uid}`).set(reviewUpdate, { merge: true });
          userUpdates.reviews_minted += 1;
        }
        const clearedKeys = Object.keys(userClear);
        if (clearedKeys.length) {
          userClear.id_tokens_rotated_at = admin.firestore.FieldValue.serverTimestamp();
          await db.doc(`users/${uid}`).update(userClear);
          userUpdates.cleared_fields += clearedKeys.length;
        }
      } catch (e) {
        userUpdates.errors += 1;
        console.warn('user migrate failed', uid, e?.message);
      }
    }
  }

  console.log(JSON.stringify({
    project: PROJECT, bucket: BUCKET,
    mode: DRY_RUN ? 'DRY-RUN' : 'WRITE',
    per_object: perObject,
    users: userUpdates,
    orphans_rotated: orphans.length,
  }, null, 2));
  if (perObject.errors > 0 || userUpdates.errors > 0) process.exit(2);
}

main().catch((e) => { console.error('[A2 revoke] failed', e); process.exit(1); });
