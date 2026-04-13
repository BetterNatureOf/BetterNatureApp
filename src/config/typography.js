export const Fonts = {
  brush: 'Caveat-Bold',
  system: undefined, // Platform default (SF Pro on iOS)
};

// NOTE: these are raw baseline sizes. The global Text render patch in App.js
// applies responsive scaling (fp) to every fontSize at render time, so we
// don't call fp() here — otherwise sizes would get scaled twice.
export const Type = {
  screenTitle: {
    fontFamily: 'Caveat-Bold',
    fontSize: 30,
    fontWeight: '700',
  },
  sectionHeader: {
    fontFamily: 'Caveat-Bold',
    fontSize: 22,
    fontWeight: '700',
  },
  heroStat: {
    fontFamily: 'Caveat-Bold',
    fontSize: 46,
    fontWeight: '800',
  },
  statNumber: {
    fontFamily: 'Caveat-Bold',
    fontSize: 26,
    fontWeight: '700',
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
    letterSpacing: 0.3,
  },
};
