/*
 * Assigns the founder account (satvik.koya@betternatureofficial.org)
 * as the Memphis chapter president — in addition to keeping the
 * existing super_admin / executive role. The Pres dashboard shows
 * up as a shortcut card on the Executive dashboard whenever
 * users/{uid}.chapter_id is set.
 *
 * What this writes:
 *   users/{uid}.chapter_id       = <memphis chapter id>
 *   users/{uid}.chapter_name     = "BetterNature Memphis"
 *   users/{uid}.role             = unchanged (super_admin / executive)
 *   chapters/{memphis}.president_uid    = uid
 *   chapters/{memphis}.president_name   = user's name
 *   chapters/{memphis}.president_email  = user's email
 *
 * Idempotent — safe to re-run.
 */
const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const KEY = path.join(__dirname, 'serviceAccount.json');
if (fs.existsSync(KEY)) {
  admin.initializeApp({ credential: admin.credential.cert(require(KEY)) });
} else {
  admin.initializeApp({ projectId: 'better-nature-app' });
}
const db = admin.firestore();

const EMAIL = 'satvik.koya@betternatureofficial.org';

(async () => {
  // 1. Find the user.
  const usnap = await db.collection('users').where('email', '==', EMAIL).get();
  if (usnap.empty) throw new Error(`No user doc with email ${EMAIL}`);
  const userDoc = usnap.docs[0];
  const uid = userDoc.id;
  const user = userDoc.data();
  console.log(`Found user ${EMAIL} -> ${uid}  (role=${user.role})`);

  // 2. Find Memphis chapter (city match, status active).
  const csnap = await db.collection('chapters').get();
  const memphis = csnap.docs.find((d) => {
    const c = d.data();
    return (c.city || '').toLowerCase() === 'memphis';
  });
  if (!memphis) throw new Error('No Memphis chapter in /chapters. Create it first.');
  const chapterId = memphis.id;
  console.log(`Found Memphis chapter -> ${chapterId}`);

  // 3. Stamp chapter on the user.
  await userDoc.ref.update({
    chapter_id: chapterId,
    chapter_name: 'BetterNature Memphis',
    chapter: { id: chapterId, name: 'BetterNature Memphis' },
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  });
  console.log(`✔ users/${uid}.chapter_id = ${chapterId}`);

  // 4. Stamp president pointer on the chapter doc.
  await memphis.ref.update({
    president_uid: uid,
    president_name: user.name || user.full_name || EMAIL,
    president_email: EMAIL,
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  });
  console.log(`✔ chapters/${chapterId}.president_uid = ${uid}`);

  console.log('done. Sign out / sign back in to refresh your in-app role.');
  process.exit(0);
})().catch((e) => {
  console.error('failed', e);
  process.exit(1);
});
