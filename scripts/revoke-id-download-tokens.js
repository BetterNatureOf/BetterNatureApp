#!/usr/bin/env node
/**
 * A2 — revoke Firebase Storage download tokens on existing ID files.
 *
 * The rules change in storage.rules locks /id-docs reads to the
 * owner + exec, but does NOT revoke download URLs already handed
 * out: Firebase Storage attaches a per-object token in metadata
 * (`firebaseStorageDownloadTokens`), and any URL carrying that
 * token keeps working regardless of rules. Deleting the field on
 * /users or re-uploading does not help either — the token is
 * server-side metadata, not something the DB entry controls.
 *
 * This script preserves the evidence (we never delete the files)
 * and rotates the token on each ID object. Rotation invalidates
 * every previously-handed-out download URL for that object. The
 * owner (via self-read rule) and execs (via the exec branch) can
 * still mint a fresh download URL on demand through the SDK.
 *
 * ALSO: clears the stored `id_front_url` / `id_back_url` fields on
 * /users, which hold the OLD-token URL and would otherwise mislead
 * exec reviewers into clicking a now-broken link.
 *
 * USAGE
 *   # Preview (no mutation):
 *   node scripts/revoke-id-download-tokens.js --dry-run
 *
 *   # Apply:
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
 *     node scripts/revoke-id-download-tokens.js
 *
 * The service account needs roles/datastore.user AND
 * roles/storage.objectAdmin on the Firebase project.
 *
 * Idempotent: rotating a token twice is harmless; the second run
 * just rotates again. Safe to re-run after a window of new
 * uploads. Logs never contain the token values or ID URLs.
 */

const admin = require('firebase-admin');
const crypto = require('crypto');

const DRY_RUN = process.argv.includes('--dry-run');
const TOKEN_META_KEY = 'firebaseStorageDownloadTokens';

function newToken() {
  // UUID v4 — Firebase accepts any opaque string in this metadata
  // field; v4 matches the format Firebase itself writes.
  return crypto.randomUUID();
}

// Firebase saves URLs like
//   https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<ENCODED_PATH>?alt=media&token=<T>
// Pull out the object path (`id-docs/front/<uid>-front-123.jpg`).
function parseStoragePath(url) {
  if (!url || typeof url !== 'string') return null;
  const m = /\/o\/([^?]+)/.exec(url);
  if (!m) return null;
  try { return decodeURIComponent(m[1]); } catch { return null; }
}

async function rotateObjectToken(bucket, path) {
  const file = bucket.file(path);
  const [exists] = await file.exists();
  if (!exists) return { status: 'missing' };
  // Update metadata, replacing any existing token with a fresh one.
  // Setting the key wholesale (not merging) ensures ALL prior tokens
  // are invalidated — a comma-separated list is Firebase's internal
  // multi-token format and we don't want any lingering entries.
  const [meta] = await file.getMetadata();
  const prior = (meta.metadata && meta.metadata[TOKEN_META_KEY]) || null;
  await file.setMetadata({
    metadata: { ...(meta.metadata || {}), [TOKEN_META_KEY]: newToken() },
  });
  return { status: 'rotated', had_prior_token: !!prior };
}

async function main() {
  if (!admin.apps.length) admin.initializeApp();
  const db = admin.firestore();
  const bucket = admin.storage().bucket();

  console.log(`[A2 token-revoke] mode=${DRY_RUN ? 'DRY-RUN' : 'WRITE'} bucket=${bucket.name}`);

  const usersSnap = await db.collection('users').get();
  let scanned = 0, hadUrl = 0, rotated = 0, cleared = 0, missing = 0, errors = 0;

  for (const d of usersSnap.docs) {
    scanned += 1;
    const u = d.data();
    const paths = new Set();
    for (const key of ['id_front_url', 'id_back_url']) {
      const path = parseStoragePath(u[key]);
      if (path && path.startsWith('id-docs/')) paths.add(path);
    }
    if (!paths.size) continue;
    hadUrl += 1;

    for (const path of paths) {
      try {
        if (DRY_RUN) {
          console.log(`would rotate ${path}`);
        } else {
          const r = await rotateObjectToken(bucket, path);
          if (r.status === 'rotated') rotated += 1;
          if (r.status === 'missing') missing += 1;
        }
      } catch (e) {
        errors += 1;
        console.warn(`error rotating ${path}: ${e?.message}`);
      }
    }

    // Clear the stale URLs on /users. We keep a boolean marker so
    // the exec reviewer still knows an ID was uploaded; they fetch a
    // fresh download URL through the admin SDK on demand.
    if (!DRY_RUN) {
      const updates = {};
      if (u.id_front_url) { updates.id_front_url = null; updates.id_front_present = true; }
      if (u.id_back_url)  { updates.id_back_url  = null; updates.id_back_present  = true; }
      updates.id_tokens_rotated_at = admin.firestore.FieldValue.serverTimestamp();
      await d.ref.update(updates);
      cleared += 1;
    }
  }

  console.log(JSON.stringify({
    scanned_users: scanned,
    users_with_id_urls: hadUrl,
    objects_rotated: rotated,
    users_url_fields_cleared: cleared,
    objects_missing: missing,
    errors,
  }, null, 2));
}

main().catch((e) => { console.error('[A2 token-revoke] failed', e); process.exit(1); });
