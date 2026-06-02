// Always-fresh app version on web.
//
// On boot we hold two values:
//   - BUILD_VERSION — baked into the bundle at build time by
//     scripts/stamp-version.js
//   - serverVersion — fetched from /version.json (Cloudflare serves
//     this with no-cache headers — see public/_headers)
//
// If they differ → the deploy moved while the user had the tab open,
// or they're on a stale bundle from a previous visit. Either way, we:
//   1. Unregister any installed service worker so the next reload
//      pulls fresh from Cloudflare, not a worker cache.
//   2. Clear caches API entries.
//   3. Reload the page.
//
// Runs once on mount and again every 5 minutes while the tab is open
// (so a multi-day session picks up new deploys without the user having
// to remember to refresh).
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { BUILD_VERSION } from '../config/buildVersion';

async function nukeWebCaches() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return;
  try {
    if (navigator.serviceWorker) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch {}
  try {
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {}
}

export default function useFreshAppVersion({ pollEveryMs = 5 * 60 * 1000 } = {}) {
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof window === 'undefined') return;

    let cancelled = false;

    async function check() {
      try {
        // Cache-busting query so the request bypasses every layer.
        const res = await fetch('/version.json?ts=' + Date.now(), { cache: 'no-store' });
        if (!res.ok) return;
        const { version } = await res.json();
        if (cancelled) return;
        if (!version || version === BUILD_VERSION) return;

        console.info('[version] new build live:', version, '→ refreshing');
        await nukeWebCaches();
        // Hard-reload, bypassing the http cache. The boolean arg is
        // deprecated in spec but Chrome / Safari still honor it.
        try { window.location.reload(true); } catch { window.location.reload(); }
      } catch {
        /* offline / blocked — try again on the next interval */
      }
    }

    check();
    const id = setInterval(check, pollEveryMs);
    return () => { cancelled = true; clearInterval(id); };
  }, [pollEveryMs]);
}
