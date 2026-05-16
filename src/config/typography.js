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

// Display = a serif on web (Instrument Serif matches the website),
// platform default elsewhere. Body uses the system sans everywhere.
const DISPLAY = Platform.select({
  web: '"Instrument Serif", "Times New Roman", Georgia, serif',
  ios: undefined,      // SF Pro
  android: undefined,  // Roboto
  default: undefined,
});

export const Fonts = {
  display: DISPLAY,
  brush: DISPLAY, // back-compat: anything still asking for brush gets the display serif
  system: undefined,
};

export const Type = {
  screenTitle: {
    fontFamily: DISPLAY,
    fontSize: 30,
    fontWeight: '600',
    letterSpacing: -0.5,
    lineHeight: 36,
  },
  sectionHeader: {
    fontFamily: DISPLAY,
    fontSize: 22,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  heroStat: {
    fontSize: 44,
    fontWeight: '800',
    letterSpacing: -1.2,
  },
  statNumber: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  body: {
    fontSize: 15,
    fontWeight: '400',
    lineHeight: 22,
  },
  bodyMedium: {
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 22,
  },
  caption: {
    fontSize: 13,
    color: '#5C6370',
    lineHeight: 18,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  button: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
};
