export const Colors = {
  // Primary — Blossom 600. Approved 2026-11-22 (Figma "Option A"): the old
  // #E8627C failed WCAG AA with white text (3.25:1); this carries white at
  // 5.14:1 and reads at 4.85:1 as text on cream.
  pink: '#C13D5B',
  pinkSoft: '#F28AA9',
  pinkLight: '#FDF0F3',
  pinkGlow: 'rgba(193,61,91,0.18)',

  // Greens
  green: '#2A5648',
  greenMid: '#367262',
  greenLight: '#E6F0EC',
  greenGlow: 'rgba(42,86,72,0.12)',

  // Sage (IRIS)
  sage: '#6FA3A3',
  sageLight: '#EAF3F3',

  // Sky (Hydro)
  sky: '#7CC5D4',
  skyLight: '#EAF6F9',
  skyDark: '#4A8E9A',

  // Warm accents
  amber: '#E8A94E',
  amberLight: '#FFF6E6',
  amberGlow: 'rgba(232,169,78,0.15)',

  // Neutrals
  cream: '#FAF8F5',
  dark: '#1A1F2E',
  gray: '#5C6370',
  grayMid: '#8E95A2',
  grayLight: '#E8EBF0',
  grayFaint: '#F3F4F6',
  white: '#FFFFFF',

  // Glass & overlay
  glass: 'rgba(255,255,255,0.72)',
  glassBorder: 'rgba(255,255,255,0.45)',
  overlay: 'rgba(26,31,46,0.04)',

  // Gradients (start → end arrays for LinearGradient)
  gradient: {
    green: ['#2A5648', '#3D7A67'],
    greenSoft: ['#367262', '#4A9B84'],
    pink: ['#C13D5B', '#C9405E'], // Blossom 600 → 550, white text ≥ 4.80:1 end to end
    sunset: ['#E8627C', '#E8A94E'],
    sky: ['#7CC5D4', '#A8DDE6'],
    sage: ['#6FA3A3', '#8FC4C4'],
    cream: ['#FAF8F5', '#F4F0EB'],
    card: ['#FFFFFF', '#FAFBFC'],
  },

  // Project mapping
  project: {
    IRIS: { primary: '#6FA3A3', light: '#EAF3F3', glow: 'rgba(111,163,163,0.12)' },
    Evergreen: { primary: '#2A5648', light: '#E6F0EC', glow: 'rgba(42,86,72,0.12)' },
    Hydro: { primary: '#7CC5D4', light: '#EAF6F9', glow: 'rgba(124,197,212,0.12)' },
  },
};
