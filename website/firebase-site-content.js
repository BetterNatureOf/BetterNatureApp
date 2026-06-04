// Pulls the live site_content/main doc the exec edits inside the
// app and merges it over the static window.CONTENT from content.js
// before app.js paints anything. So any edit in the app's Website
// Content screen propagates to betternatureofficial.org on the
// next page load — no website redeploy required.
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';
import { db } from './firebase-auth.js';

function deepMerge(base, patch) {
  if (!patch || typeof patch !== 'object') return base;
  const out = Array.isArray(base) ? [...base] : { ...(base || {}) };
  for (const k of Object.keys(patch)) {
    const v = patch[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && typeof base?.[k] === 'object' && !Array.isArray(base?.[k])) {
      out[k] = deepMerge(base[k], v);
    } else if (v !== null && v !== undefined && v !== '') {
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
