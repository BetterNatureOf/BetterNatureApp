// Inject Google Fonts into the document head when the app runs in a
// browser. Expo's default web template has no <link> for our type stack,
// so without this the editorial serif we reference in typography.js
// silently falls back to Times New Roman.
//
// We preconnect to fonts.gstatic.com first (saves ~50ms on the font
// fetch), then load Inter for body + Instrument Serif for display.
// Both have a `display=swap` so we never block paint.
//
// Idempotent — calling twice does nothing the second time.
import { Platform } from 'react-native';

const FLAG = '__BN_FONTS_LOADED__';

export function injectWebFonts() {
  if (Platform.OS !== 'web') return;
  if (typeof document === 'undefined') return;
  if (window[FLAG]) return;
  window[FLAG] = true;

  const head = document.head;

  // Preconnects — speed up the actual font CSS fetch
  const pre1 = document.createElement('link');
  pre1.rel = 'preconnect';
  pre1.href = 'https://fonts.googleapis.com';
  head.appendChild(pre1);

  const pre2 = document.createElement('link');
  pre2.rel = 'preconnect';
  pre2.href = 'https://fonts.gstatic.com';
  pre2.crossOrigin = '';
  head.appendChild(pre2);

  // Inter (400/500/600/700/800) — body, buttons, captions, all numbers.
  // Instrument Serif (400, regular + italic) — display headings.
  const sheet = document.createElement('link');
  sheet.rel = 'stylesheet';
  sheet.href =
    'https://fonts.googleapis.com/css2' +
    '?family=Inter:wght@400;500;600;700;800' +
    '&family=Instrument+Serif:ital@0;1' +
    '&display=swap';
  head.appendChild(sheet);

  // Default everything to Inter at the document level so any stray
  // un-styled text (like the loading screen) also reads correctly.
  const style = document.createElement('style');
  style.textContent = `
    /* react-native-web's <ScrollView> only scrolls when its ancestor
       chain has a real height. Expo's default web template ships
       html/body with no explicit height, so flex: 1 inside collapses
       to auto and the trackpad does nothing. Pin them to 100% so the
       flex chain (and therefore every screen's ScrollView) works. */
    html, body, #root, #__next {
      height: 100%;
      margin: 0;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system,
        "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-feature-settings: "cv11", "ss01", "ss03";
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
    }
    body { overflow: hidden; }
    /* Let RNW scroll panels overflow their parent, just like native. */
    #root > * { height: 100%; }
  `;
  head.appendChild(style);
}
