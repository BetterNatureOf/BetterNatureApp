// Type system — editorial sans + tighter tracking, no decorative handwriting.
//
// Previously this file pinned everything to Caveat (a casual brush font),
// which read as a kids-camp poster instead of a credible nonprofit. We
// dropped it entirely. Platform system fonts (SF Pro on iOS, Roboto on
// Android, native system stack on web) carry the weight; negative
// letter-spacing on display sizes gives the modern editorial feel.
//
// The global Text render patch in App.js applies responsive scaling (fp)
// to every fontSize at render time, so we use raw baseline sizes here.
import { Platform } from 'react-native';

// On web we load Inter + Instrument Serif via webFonts.js at boot.
// Native uses platform defaults (SF Pro / Roboto) since loading Google
// Fonts on native would require a custom Font.loadAsync step we
// intentionally dropped.
const DISPLAY = Platform.select({
  web: '"Instrument Serif", "Times New Roman", Georgia, serif',
  default: undefined,
});

const SANS = Platform.select({
  web: 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  default: undefined,
});

export const Fonts = {
  display: DISPLAY,
  sans: SANS,
  brush: DISPLAY, // back-compat: anything still asking for brush gets display serif
  system: SANS,
};

export const Type = {
  // Display — editorial serif for screen titles and section headers.
  screenTitle: {
    fontFamily: DISPLAY,
    fontSize: 34,
    fontWeight: '400',  // Instrument Serif only ships in 400; serif weight comes from the shape itself
    letterSpacing: -0.5,
    lineHeight: 40,
  },
  sectionHeader: {
    fontFamily: DISPLAY,
    fontSize: 24,
    fontWeight: '400',
    letterSpacing: -0.3,
    lineHeight: 30,
  },

  // Stat numerics — Inter Bold with tabular-style tracking. Big and tight.
  heroStat: {
    fontFamily: SANS,
    fontSize: 44,
    fontWeight: '800',
    letterSpacing: -1.4,
    lineHeight: 48,
  },
  statNumber: {
    fontFamily: SANS,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.6,
    lineHeight: 32,
  },

  // Body + UI — Inter at three weights.
  body: {
    fontFamily: SANS,
    fontSize: 15,
    fontWeight: '400',
    lineHeight: 22,
  },
  bodyMedium: {
    fontFamily: SANS,
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 22,
  },
  caption: {
    fontFamily: SANS,
    fontSize: 13,
    color: '#5C6370',
    lineHeight: 18,
  },
  eyebrow: {
    fontFamily: SANS,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  button: {
    fontFamily: SANS,
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
};
