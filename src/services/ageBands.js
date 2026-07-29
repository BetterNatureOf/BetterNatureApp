// Age band derivation from date of birth.
//
// Blueprint §26.2 + §26.4 + §26.5 require guardian consent for any
// account whose holder is under 18, and stricter youth-protection
// safeguards for anyone under 13. We collect DOB at signup and derive
// the band here rather than asking users to self-classify — bands
// auto-transition on birthdays, and legal footprint is cleaner (one
// stored fact, not two).
//
// DOB is stored as an ISO-8601 date string (YYYY-MM-DD) on the user
// doc. `age_band` is derived + persisted so rules + queries don't have
// to recompute it on every read.

export const AGE_BANDS = Object.freeze({
  UNDER_13:  'under_13',    // COPPA-relevant; guardian required + tightest safeguards
  YOUTH:     'youth',       // 13–17; guardian consent required
  ADULT:     'adult',       // 18+
  UNKNOWN:   'unknown',     // no DOB on file
});

// Guardian consent flow required for accounts in these bands.
export const GUARDIAN_REQUIRED_BANDS = new Set([AGE_BANDS.UNDER_13, AGE_BANDS.YOUTH]);

// Reasonable bounds so a fat-finger typo (year 1899 or 2099) doesn't
// silently pass validation.
export const MIN_REASONABLE_AGE = 5;
export const MAX_REASONABLE_AGE = 120;

// Returns integer years. Handles leap-year birthdays correctly.
export function ageInYears(dob, now = new Date()) {
  if (!dob) return null;
  const d = dob instanceof Date ? dob : new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  let years = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) years -= 1;
  return years;
}

export function ageBandFor(dob) {
  const y = ageInYears(dob);
  if (y === null || y < 0) return AGE_BANDS.UNKNOWN;
  if (y < 13) return AGE_BANDS.UNDER_13;
  if (y < 18) return AGE_BANDS.YOUTH;
  return AGE_BANDS.ADULT;
}

export function guardianRequired(dob) {
  return GUARDIAN_REQUIRED_BANDS.has(ageBandFor(dob));
}

// Returns { ok: true } or { ok: false, reason } — a validator the
// signup form can call inline before advancing.
export function validateDob(dob) {
  if (!dob) return { ok: false, reason: 'Date of birth is required.' };
  const d = dob instanceof Date ? dob : new Date(dob);
  if (Number.isNaN(d.getTime())) return { ok: false, reason: 'That date doesn\'t look right.' };
  const y = ageInYears(d);
  if (y === null) return { ok: false, reason: 'Enter a valid date of birth.' };
  if (y < 0) return { ok: false, reason: 'Date of birth is in the future.' };
  if (y < MIN_REASONABLE_AGE) return { ok: false, reason: `Users must be at least ${MIN_REASONABLE_AGE} years old.` };
  if (y > MAX_REASONABLE_AGE) return { ok: false, reason: 'Please double-check the year.' };
  return { ok: true };
}

// Serialize a Date → 'YYYY-MM-DD' for Firestore storage.
export function dobToIso(dob) {
  if (!dob) return null;
  const d = dob instanceof Date ? dob : new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
