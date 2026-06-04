// Website content store. One Firestore doc — site_content/main —
// holds every editable field the marketing site renders. The app's
// WebsiteContent screen reads + writes this doc; website/app.js
// merges it over the static content.js at page load so visitors
// see the latest values without a deploy.
//
// Shape (subset of website/content.js):
//   {
//     hero:     { eyebrow, headline, headlineItalic, subhead,
//                 primaryCta:{text,href}, secondaryCta:{text,href} },
//     impact:   { eyebrow, title },          (numbers are live)
//     chapters: { eyebrow, title, body, startChapterUrl },
//     programs: {
//       eyebrow, title,
//       items: [{ key, code, title, blurb, stat }]
//     },
//     contact:  { email, instagram, phone, address },
//     updated_at, updated_by
//   }
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../config/firebase';

const REF = () => doc(db, 'site_content', 'main');

export async function loadSiteContent() {
  if (!isFirebaseConfigured) return null;
  const snap = await getDoc(REF());
  return snap.exists() ? snap.data() : null;
}

export async function saveSiteContent(patch, who) {
  if (!isFirebaseConfigured) throw new Error('Firebase not configured');
  // setDoc with merge:true so a partial save never wipes the doc.
  await setDoc(REF(), {
    ...patch,
    updated_at: serverTimestamp(),
    updated_by: who || null,
  }, { merge: true });
}
