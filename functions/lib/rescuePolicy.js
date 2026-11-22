// Better Nature rescue operating policy: the one place these numbers live.
// Server code (dispatch, offers, partner requests, recurring donations,
// receiving reservations) and the app's labels both read from here.
//
// These are operational planning defaults chosen by Better Nature, not
// food-safety limits or regulatory guidance.
//
// Units: every *_MIN value is minutes, every *_MS value is milliseconds.
//
// Deadline meanings (used the same way in UI and server validation):
//   pickup_by   — collection complete: the volunteer has arrived at the donor
//                 and finished loading by this time.
//   arrival_by  — handoff complete: the volunteer has arrived at the
//                 receiving site and finished unloading by this time.
const MINUTE_MS = 60_000;

const POLICY = Object.freeze({
  // Exactly one volunteer holds an actionable offer for a rescue at a time.
  OFFER_CONCURRENCY: 1,
  // Longest an offer stays open. It closes sooner when the volunteer's last
  // feasible start time comes first.
  OFFER_MAX_RESPONSE_MIN: 5,
  // An offer shorter than this is not worth sending; skip or escalate.
  OFFER_MIN_RESPONSE_MIN: 1,
  LOADING_MIN: 10,
  UNLOADING_MIN: 10,
  // Extra slack required before each deadline (not added twice):
  MARGIN_ROAD_MIN: 5,          // every leg has a road-time estimate
  MARGIN_APPROXIMATE_MIN: 15,  // any leg uses a straight-line estimate
  // Receiving partners answer within this, never later than the rescue's
  // feasible timeline allows.
  PARTNER_MAX_RESPONSE_MIN: 30,
  // Partners must answer at least this long before the pickup window ends.
  PARTNER_LATEST_BEFORE_PICKUP_END_MIN: 15,
  // Recurring donations: ask the donor to confirm this long before the
  // pickup window starts (immediately if created closer than that).
  RECURRING_CONFIRM_LEAD_MIN: 180,
  // A receiving-capacity hold normally lapses this long after arrival_by.
  RESERVATION_GRACE_MIN: 30,
  // Straight-line estimate used only when no road time exists:
  // distance × circuity at a conservative speed for the travel mode.
  APPROX_KMH: Object.freeze({ driving: 30, cycling: 12, walking: 4.5 }),
  APPROX_CIRCUITY: 1.35,
  // Map and road-routing provider the app is built for.
  ROUTING_PROVIDER: 'mapbox',
});

// Routing profile for a volunteer's saved vehicle. Unknown vehicles are
// planned as driving and flagged, never as a faster mode.
const PROFILE_BY_VEHICLE = Object.freeze({ car: 'driving', suv: 'driving', van: 'driving', bike: 'cycling', walk: 'walking' });
function travelProfile(user) {
  const type = user?.vehicle?.type;
  return PROFILE_BY_VEHICLE[type] ? { profile: PROFILE_BY_VEHICLE[type], assumed: false } : { profile: 'driving', assumed: true };
}
// Straight-line minutes for a mode; null when the distance is unusable.
function approximateMinutes(km, profile = 'driving') {
  const kmh = POLICY.APPROX_KMH[profile] || POLICY.APPROX_KMH.driving;
  if (!Number.isFinite(km) || km < 0) return null;
  return Math.ceil((km * POLICY.APPROX_CIRCUITY / kmh) * 60);
}

const ms = (min) => min * MINUTE_MS;
const marginMinutes = (anyApproximate) => (anyApproximate ? POLICY.MARGIN_APPROXIMATE_MIN : POLICY.MARGIN_ROAD_MIN);

module.exports = { POLICY, MINUTE_MS, ms, marginMinutes, travelProfile, approximateMinutes, PROFILE_BY_VEHICLE };
