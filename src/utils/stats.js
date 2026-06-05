// Helpers for the lbs-of-food rollups everywhere stats are shown.
//
// The data model used to track only `meals` (lbs * 1.2 rounded).
// We now track `lbs_rescued` on the user doc and `lbs` on
// member_activity rows. For legacy docs that only have the meals
// field, derive lbs by dividing by 1.2.
export function lbsFrom(record) {
  if (!record) return 0;
  if (typeof record.lbs_rescued === 'number') return record.lbs_rescued;
  if (typeof record.lbs === 'number') return record.lbs;
  if (typeof record.meals_rescued === 'number') return Math.round(record.meals_rescued / 1.2);
  if (typeof record.meals === 'number') return Math.round(record.meals / 1.2);
  return 0;
}

export function lbsLabel() { return 'Pounds rescued'; }
export function lbsShort()  { return 'lbs'; }

// Format a lbs number with a trailing 'lbs' suffix when small,
// 'K lbs' / 'M lbs' for big numbers so leaderboards don't sprawl.
export function fmtLbs(n) {
  const v = Math.round(n || 0);
  if (v < 1000) return `${v} lbs`;
  if (v < 1_000_000) return `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}K lbs`;
  return `${(v / 1_000_000).toFixed(1)}M lbs`;
}
