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

// Module-cached so the app doesn't refetch on every screen mount.
// useLiveSiteContent() seeds this once at app boot; individual
// screens can grab the current value with getCachedSiteContent().
let _cache = null;
let _cacheAt = 0;
const TTL_MS = 60 * 1000;

export async function loadSiteContent({ force = false } = {}) {
  if (!isFirebaseConfigured) return null;
  if (!force && _cache && (Date.now() - _cacheAt) < TTL_MS) return _cache;
  try {
    const snap = await getDoc(REF());
    _cache = snap.exists() ? snap.data() : null;
    _cacheAt = Date.now();
    return _cache;
  } catch (e) {
    console.warn('site_content load failed', e);
    return _cache; // last-known good; null if we've never loaded
  }
}

export function getCachedSiteContent() {
  return _cache;
}

// Read one denormalized field from the live site_content doc, with
// a fallback in case the doc hasn't loaded yet (first paint) or
// the field is empty.
export function siteVal(path, fallback) {
  if (!_cache) return fallback;
  const keys = path.split('.');
  let cur = _cache;
  for (const k of keys) {
    if (cur == null) return fallback;
    cur = cur[k];
  }
  return cur == null || cur === '' ? fallback : cur;
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
