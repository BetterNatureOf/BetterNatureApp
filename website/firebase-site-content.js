// Pulls the live site_content/main doc the exec edits inside the
// app and merges it over the static window.CONTENT from content.js
// before app.js paints anything. So any edit in the app's Website
// Content screen propagates to betternatureofficial.org on the
// next page load — no website redeploy required.
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';
import { db } from './firebase-auth.js';

// Defensive merge: a value from Firestore ONLY overrides content.js if
// it's actually meaningful. Empty strings, empty arrays, null, and
// undefined are all skipped so an accidentally-saved blank field in
// the editor cannot wipe out the homepage copy that's currently live.
function deepMerge(base, patch) {
  if (!patch || typeof patch !== 'object') return base;
  // If patch is an empty array, keep the base array as-is. An empty
  // array on the editor side (no team members entered yet, etc.)
  // must not erase the values that content.js shipped with.
  if (Array.isArray(patch)) return patch.length ? patch : base;
  const out = Array.isArray(base) ? [...base] : { ...(base || {}) };
  for (const k of Object.keys(patch)) {
    const v = patch[k];
    if (v == null) continue;                                 // null / undefined
    if (typeof v === 'string' && v === '') continue;         // empty string
    if (Array.isArray(v) && v.length === 0) continue;        // empty array
    if (typeof v === 'object' && !Array.isArray(v)) {
      out[k] = deepMerge(base?.[k], v);                      // recurse
    } else {
      out[k] = v;
    }
  }
  return out;
}

export async function loadSiteContent() {
  try {
    const snap = await getDoc(doc(db, 'site_content', 'main'));
    return snap.exists() ? snap.data() : null;
  } catch (e) {
    console.warn('site_content load failed', e);
    return null;
  }
}

export async function applyLiveContent() {
  const live = await loadSiteContent();
  if (!live) return;
  if (typeof window === 'undefined') return;
  window.CONTENT = deepMerge(window.CONTENT || {}, live);
}
