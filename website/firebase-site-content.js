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
//
// Arrays-of-objects are merged per index so that an item the editor
// saved without (e.g. programs.items[].cta) inherits the base's
// value for that field. This matters because the editor's seed only
// covers the fields IT lets the user edit; everything else must be
// preserved from content.js.
function deepMerge(base, patch) {
  if (!patch || typeof patch !== 'object') return base;
  if (Array.isArray(patch)) {
    if (patch.length === 0) return base;
    // Per-index merge when base has matching slots. This preserves
    // base fields (like 'cta', 'instagram', etc.) that the editor
    // doesn't expose.
    if (Array.isArray(base)) {
      const out = [];
      const len = Math.max(base.length, patch.length);
      for (let i = 0; i < len; i++) {
        const b = base[i];
        const p = patch[i];
        if (p == null) { if (b != null) out.push(b); continue; }
        if (b == null) { out.push(p); continue; }
        if (typeof p === 'object' && typeof b === 'object'
            && !Array.isArray(p) && !Array.isArray(b)) {
          out.push(deepMerge(b, p));
        } else {
          out.push(p);
        }
      }
      return out;
    }
    return patch;
  }
  const out = Array.isArray(base) ? [...base] : { ...(base || {}) };
  for (const k of Object.keys(patch)) {
    const v = patch[k];
    if (v == null) continue;                                 // null / undefined
    if (typeof v === 'string' && v === '') continue;         // empty string
    if (Array.isArray(v) && v.length === 0) continue;        // empty array
    if (typeof v === 'object' && !Array.isArray(v)) {
      out[k] = deepMerge(base?.[k], v);                      // recurse
    } else if (Array.isArray(v)) {
      out[k] = deepMerge(base?.[k], v);                      // array path
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

// Fields the CMS is NOT allowed to override — live-stats.js owns
// these numbers end-to-end (baseline in content.js + Firestore
// org_stats update via live-stats.js repaint). If we let the CMS
// touch them, an accidentally-saved zero string wipes the ticker
// on first paint and users report "stats show 0 when I open the
// site." live-stats.js already handles dynamic updates; the CMS
// has no business writing to these keys.
const LIVE_ONLY_PATHS = new Set([
  'hero.tickerStats',
  'impact.stats',
]);

function stripLiveOnlyPaths(live) {
  if (!live || typeof live !== 'object') return live;
  const cleaned = { ...live };
  for (const path of LIVE_ONLY_PATHS) {
    const parts = path.split('.');
    let cursor = cleaned;
    for (let i = 0; i < parts.length - 1; i++) {
      const key = parts[i];
      if (!cursor[key] || typeof cursor[key] !== 'object') { cursor = null; break; }
      // Copy-on-write so we don't mutate whatever the caller passed in.
      cursor[key] = Array.isArray(cursor[key]) ? [...cursor[key]] : { ...cursor[key] };
      cursor = cursor[key];
    }
    if (cursor) delete cursor[parts[parts.length - 1]];
  }
  return cleaned;
}

export async function applyLiveContent() {
  const live = await loadSiteContent();
  if (!live) return;
  if (typeof window === 'undefined') return;
  // Strip live-only fields (see above) before merging so a bad CMS
  // save can't zero out the ticker on first paint. content.js's
  // baseline stays authoritative for the ticker + impact grid until
  // live-stats.js repaints with real Firestore numbers.
  window.CONTENT = deepMerge(window.CONTENT || {}, stripLiveOnlyPaths(live));
}
