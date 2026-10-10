#!/usr/bin/env node
/**
 * A2 — revoke Firebase Storage download tokens on existing ID files.
 *
 * ChatGPT R2+R3 rewrite:
 *   • Scans the ACTUAL legacy fields written across the codebase:
 *       top-level  id_document_url, id_document_front_url, id_document_back_url
 *       top-level  driver_license_url, driver_license_front_url, driver_license_back_url
 *       top-level  id_front_url, id_back_url (older naming)
 *       nested     driver.license_url, driver.license_front_url, driver.license_back_url
 *   • Also inventories the id-docs/* Storage prefix directly, so
 *     orphan files that no /users doc references still get their
 *     tokens rotated. Preserves every file.
 *   • Per-object outcome ledger — nothing on /users is cleared
 *     unless the matching rotation succeeded.
 *   • Requires explicit --project and --bucket to prevent
 *     accidentally pointing at the wrong environment.
 *
 * The script preserves evidence (never deletes files). Rotating
 * the metadata token key `firebaseStorageDownloadTokens` to a fresh
 * UUID invalidates every URL that carried the old token server-side.
 * Reviewers get fresh URLs via the getIdViewUrl callable.
 *
 * USAGE
 *   node scripts/revoke-id-download-tokens.js --dry-run \
 *     --project=better-nature-app --bucket=better-nature-app.appspot.com
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=./sa.json \
 *     node scripts/revoke-id-download-tokens.js \
 *     --project=better-nature-app --bucket=better-nature-app.appspot.com
 *
 * Service account needs roles/datastore.user AND
 * roles/storage.objectAdmin on the target project.
 *
 * Idempotent and restartable: every write records a resumable
 * entry on /id_token_revocation_ledger/{objectPathHash}. A second
 * run skips entries already marked 'rotated'. Failed rotations stay
 * 'pending' and get retried.
 */

const admin = require('firebase-admin');
const crypto = require('crypto');

const DRY_RUN = process.argv.includes('--dry-run');
const argMap = Object.fromEntries(
  process.argv
    .filter((a) => a.startsWith('--'))
    .map((a) => a.replace(/^--/, '').split('='))
);
const PROJECT = argMap.project || '';
const BUCKET = argMap.bucket || '';

const TOKEN_META_KEY = 'firebaseStorageDownloadTokens';
const LEDGER_COLLECTION = 'id_token_revocation_ledger';

function newToken() { return crypto.randomUUID(); }
function pathHash(p) {
  return crypto.createHash('sha256').update(p).digest('hex').slice(0, 32);
}

// Legacy references on /users: both top-level and nested. The list
// is intentionally over-inclusive so one scan covers every historical
// field a prior deploy may have written.
const TOP_LEVEL_URL_FIELDS = [
  'id_document_url', 'id_document_front_url', 'id_document_back_url',
  'driver_license_url', 'driver_license_front_url', 'driver_license_back_url',
  'id_front_url', 'id_back_url',
];
const NESTED_DRIVER_FIELDS = ['license_url', 'license_front_url', 'license_back_url'];

function parseStoragePath(url) {
  if (!url || typeof url !== 'string') return null;
  const m = /\/o\/([^?]+)/.exec(url);
  if (!m) return null;
  try { return decodeURIComponent(m[1]); } catch { return null; }
}

function collectReferencedPaths(u) {
  const paths = new Set();
  for (const k of TOP_LEVEL_URL_FIELDS) {
    const p = parseStoragePath(u?.[k]);
    if (p && p.startsWith('id-docs/')) paths.add(p);
  }
  const drv = u?.driver || {};
  for (const k of NESTED_DRIVER_FIELDS) {
    const p = parseStoragePath(drv[k]);
    if (p && p.startsWith('id-docs/')) paths.add(p);
  }
  return paths;
}

async function rotateOne(bucket, path, ledgerRef) {
  const file = bucket.file(path);
  const [exists] = await file.exists();
  if (!exists) {
    if (!DRY_RUN) await ledgerRef.set({ path, status: 'missing', ts: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    return 'missing';
  }
  if (DRY_RUN) return 'would_rotate';
  const [meta] = await file.getMetadata();
  await file.setMetadata({
    metadata: { ...(meta.metadata || {}), [TOKEN_META_KEY]: newToken() },
  });
  await ledgerRef.set({
    path,
    status: 'rotated',
    rotated_at: admin.firestore.FieldValue.serverTimestamp(),
    had_prior_token: !!(meta.metadata && meta.metadata[TOKEN_META_KEY]),
  }, { merge: true });
  return 'rotated';
}

async function main() {
  if (!PROJECT) { console.error('Missing --project=<firebase-project-id>'); process.exit(2); }
  if (!BUCKET)  { console.error('Missing --bucket=<storage-bucket>'); process.exit(2); }
  if (!admin.apps.length) {
    admin.initializeApp({ projectId: PROJECT, storageBucket: BUCKET });
  }
  const db = admin.firestore();
  const bucket = admin.storage().bucket(BUCKET);

  console.log(`[A2 revoke] mode=${DRY_RUN ? 'DRY-RUN' : 'WRITE'} project=${PROJECT} bucket=${BUCKET}`);

  // 1) Collect all referenced paths from /users (both schemas).
  const referenced = new Map(); // path -> owning uid (if known)
  const userRefs = new Map();   // uid -> Set<path>
  const usersSnap = await db.collection('users').get();
  for (const d of usersSnap.docs) {
    const paths = collectReferencedPaths(d.data());
    if (paths.size) {
      userRefs.set(d.id, paths);
      for (const p of paths) referenced.set(p, d.id);
    }
  }

  // 2) Inventory the id-docs/ Storage prefix for orphan files
  //    (uploads that no /users row currently references — including
  //    historical uploads and files from deleted users).
  const [storageFiles] = await bucket.getFiles({ prefix: 'id-docs/' });
  const storagePaths = new Set(storageFiles.map((f) => f.name));
  const orphans = [...storagePaths].filter((p) => !referenced.has(p));

  console.log(`[inventory] users_with_refs=${userRefs.size} unique_referenced_paths=${referenced.size} storage_files=${storagePaths.size} orphans=${orphans.length}`);

  // 3) Rotate every path (referenced + orphans). Record each in the
  //    ledger; retry-safe because the ledger key is the path hash.
  const perObject = { rotated: 0, missing: 0, would_rotate: 0, errors: 0 };
  const allPaths = new Set([...referenced.keys(), ...orphans]);
  for (const p of allPaths) {
    const ledgerRef = db.collection(LEDGER_COLLECTION).doc(pathHash(p));
    try {
      const existing = await ledgerRef.get();
      if (existing.exists && existing.data()?.status === 'rotated' && !DRY_RUN) {
        perObject.rotated += 1;
        continue;
      }
      const r = await rotateOne(bucket, p, ledgerRef);
      if (r === 'rotated') perObject.rotated += 1;
      else if (r === 'missing') perObject.missing += 1;
      else perObject.would_rotate += 1;
    } catch (e) {
      perObject.errors += 1;
      console.warn('rotate failed', p, e?.message);
      if (!DRY_RUN) {
        try { await ledgerRef.set({ path: p, status: 'error', error: e?.message || 'unknown', ts: admin.firestore.FieldValue.serverTimestamp() }, { merge: true }); } catch {}
      }
    }
  }

  // 4) Clear /users references ONLY when every path on that user
  //    rotated successfully. Preserves evidence pointers for retry
  //    when a rotation failed.
  const userUpdates = { attempted: 0, cleared: 0, deferred: 0, errors: 0 };
  if (!DRY_RUN) {
    for (const [uid, paths] of userRefs) {
      userUpdates.attempted += 1;
      let allOk = true;
      for (const p of paths) {
        const ledgerDoc = await db.collection(LEDGER_COLLECTION).doc(pathHash(p)).get();
        const s = ledgerDoc.exists ? ledgerDoc.data()?.status : null;
        if (s !== 'rotated' && s !== 'missing') { allOk = false; break; }
      }
      if (!allOk) { userUpdates.deferred += 1; continue; }

      // Build the update — null bearer URLs, set presence booleans,
      // stamp when the rotation completed. Nested driver block is
      // partially updated via field paths to avoid clobbering non-ID
      // sub-fields.
      try {
        const u = (await db.doc(`users/${uid}`).get()).data() || {};
        const upd = { id_tokens_rotated_at: admin.firestore.FieldValue.serverTimestamp() };
        for (const k of TOP_LEVEL_URL_FIELDS) {
          if (u[k]) {
            upd[k] = null;
            if (k.includes('front')) upd.id_front_present = true;
            if (k.includes('back'))  upd.id_back_present  = true;
            if (k === 'id_document_url') upd.id_front_present = true;
          }
        }
        const drv = u.driver || {};
        for (const k of NESTED_DRIVER_FIELDS) {
          if (drv[k]) upd[`driver.${k}`] = null;
        }
        await db.doc(`users/${uid}`).update(upd);
        userUpdates.cleared += 1;
      } catch (e) {
        userUpdates.errors += 1;
        console.warn('user clear failed', uid, e?.message);
      }
    }
  }

  console.log(JSON.stringify({
    project: PROJECT,
    bucket: BUCKET,
    mode: DRY_RUN ? 'DRY-RUN' : 'WRITE',
    per_object: perObject,
    users: {
      ...userUpdates,
      with_refs: userRefs.size,
    },
    orphans_rotated: orphans.length,
  }, null, 2));
  if (perObject.errors > 0 || userUpdates.errors > 0) process.exit(2);
}

main().catch((e) => { console.error('[A2 revoke] failed', e); process.exit(1); });
