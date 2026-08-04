// One shared responsive layout for every top-level screen in the app.
//
// Phone (<600px)   — single column, tight padding, one hero
// Tablet (600-1023) — single column but roomier: more horizontal
//                     padding, larger hero type, wider max width
// Desktop (≥1024)  — capped column width with generous padding so the
//                     mobile design doesn't stretch to 27" monitors
//
// Screens consume this via `useResponsiveLayout()` and spread the
// returned `contentStyle` onto Screen's contentStyle prop. Individual
// screens can layer on their own overrides (e.g. a two-column split
// on very wide screens) but the baseline padding + cap comes from
// here so nothing looks like it was designed for a different device.
import { useMemo } from 'react';
import useBreakpoint from './useBreakpoint';

// Cap values chosen so a phone design at 380px scales up cleanly:
// the mobile column stays ~740px max even on wide desktop, so the
// hero card still reads at a normal 65-character line length instead
// of stretching to 1200px of text.
const CAPS = {
  phone:   { maxWidth: null, padH: 20, padT: 60 },
  tablet:  { maxWidth: 720,  padH: 40, padT: 60 },
  desktop: { maxWidth: 760,  padH: 56, padT: 64 },
};

// A wider cap for surfaces that legitimately benefit from more
// horizontal room — the exec dashboard's KPI trio + LiveOps table,
// the Manage-* admin lists. Screens opt in via
// useResponsiveLayout({ wide: true }).
const WIDE_CAPS = {
  phone:   { maxWidth: null, padH: 20, padT: 60 },
  tablet:  { maxWidth: 820,  padH: 40, padT: 60 },
  desktop: { maxWidth: 1040, padH: 64, padT: 64 },
};

/**
 * Returns { contentStyle, breakpoint, isPhone, isTablet, isDesktop, width }.
 * contentStyle is meant to be spread onto <Screen contentStyle={...}>.
 * Screens that need to know the breakpoint for further branching
 * (e.g. render a side rail on desktop only) pull it from the same
 * return value so we don't have to also call useBreakpoint.
 */
export default function useResponsiveLayout({ wide = false, bottom = 60, gap = 12 } = {}) {
  const bp = useBreakpoint();
  const table = wide ? WIDE_CAPS : CAPS;
  const dims = table[bp.breakpoint];

  const contentStyle = useMemo(() => {
    const style = {
      paddingHorizontal: dims.padH,
      paddingTop: dims.padT,
      paddingBottom: bottom,
      gap,
    };
    if (dims.maxWidth) {
      style.maxWidth = dims.maxWidth;
      style.width = '100%';
      style.alignSelf = 'center';
    }
    return style;
  }, [dims.padH, dims.padT, dims.maxWidth, bottom, gap]);

  // Tool-grid column count per breakpoint. Callers spread the returned
  // minWidth onto their tile style so a flexWrap row lays out N-up
  // without a hard column count that breaks on skinny phones.
  //   phone: 2-up · tablet: 3-up · desktop: 4-up
  const toolCols = bp.isDesktop ? 4 : bp.isTablet ? 3 : 2;
  const toolTileMinWidth = bp.isDesktop ? '22%' : bp.isTablet ? '30%' : '47%';

  return {
    ...bp,
    contentStyle,
    hPad: dims.padH,
    toolCols,
    toolTileMinWidth,
  };
}
