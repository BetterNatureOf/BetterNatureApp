// Complete-trip planning: the single implementation used by live dispatch,
// offer acceptance and coordinator suggestions.
//
//   volunteer → donor → (wait until food is ready) → loading
//             → receiving site → (wait until it opens) → unloading
//
// Times are epoch milliseconds; durations are minutes. Policy numbers come
// from lib/rescuePolicy.js. Deadline meanings:
//   pickupBy   collection complete (arrived and loaded)
//   arrivalBy  handoff complete (arrived and unloaded)
// The margin (5 min when every leg is a road estimate, 15 min when any leg
// is a straight-line approximation) is required before each deadline; it is
// not added twice.
//
// A missing leg is never treated as zero minutes and never as "fits":
// the result is `feasible: null` and dispatch hands the rescue to a
// coordinator instead of offering it.
const { greatCircleDistance, cellToLatLng } = require('h3-js');
const { POLICY, MINUTE_MS, marginMinutes, approximateMinutes, travelProfile } = require('./lib/rescuePolicy');
const { zoned, localToUtc } = require('./lib/localTime');

const MINUTE = MINUTE_MS;
const leg = (minutes, basis) => (Number.isFinite(minutes) && minutes >= 0 ? { minutes, basis } : null);

function journey({ now, toPickup, toSite, readyAt, pickupBy, arrivalBy, siteOpensAt, availableUntil }) {
  if (!Number.isFinite(pickupBy) || !Number.isFinite(arrivalBy)) return { feasible: null, reason: 'deadline_unknown' };
  if (!toPickup || !Number.isFinite(toPickup.minutes)) return { feasible: null, reason: 'pickup_leg_unknown' };
  if (!toSite || !Number.isFinite(toSite.minutes)) return { feasible: null, reason: 'dropoff_leg_unknown' };
  const approximate = toPickup.basis !== 'road' || toSite.basis !== 'road';
  const marginMin = marginMinutes(approximate);
  const m = marginMin * MINUTE;
  const P = toPickup.minutes * MINUTE, S = toSite.minutes * MINUTE;
  const L = POLICY.LOADING_MIN * MINUTE, U = POLICY.UNLOADING_MIN * MINUTE;
  const ready = Number.isFinite(readyAt) ? readyAt : -Infinity;
  const opens = Number.isFinite(siteOpensAt) ? siteOpensAt : -Infinity;
  const handoffDeadline = Math.min(arrivalBy, Number.isFinite(availableUntil) ? availableUntil : Infinity);

  const arrivesDonorAt = now + P;
  const loadedAt = Math.max(arrivesDonorAt, ready) + L;
  const arrivesSiteAt = loadedAt + S;
  const finishAt = Math.max(arrivesSiteAt, opens) + U;
  const base = {
    basis: approximate ? 'approximate' : 'road', marginMinutes: marginMin,
    toPickupMinutes: toPickup.minutes, toSiteMinutes: toSite.minutes,
    legs: { to_pickup: toPickup.basis, to_site: toSite.basis },
    loadedAt, finishAt,
    waitMinutes: Math.round((Math.max(ready - arrivesDonorAt, 0) + Math.max(opens - arrivesSiteAt, 0)) / MINUTE),
    totalMinutes: Math.round((finishAt - now) / MINUTE),
  };
  if (loadedAt > pickupBy - m) return { ...base, feasible: false, reason: 'pickup_deadline' };
  if (finishAt > handoffDeadline - m) {
    return { ...base, feasible: false, reason: availableUntil < arrivalBy ? 'volunteer_unavailable' : 'delivery_deadline' };
  }
  // Latest departure that still meets both deadlines with the margin.
  // Waiting for readiness or opening only absorbs a later start.
  const latestStartAt = Math.min(pickupBy - m - L - P, handoffDeadline - m - U - S - L - P);
  return { ...base, feasible: true, latestStartAt, slackMinutes: Math.floor((latestStartAt - now) / MINUTE) };
}

// Opening time of the site's hours slot that contains `atMs`, in the
// site's timezone. null when hours are unknown or it isn't open then.
function siteOpensBefore(site, atMs) {
  if (!site?.hours || !Number.isFinite(atMs)) return null;
  const tz = site.timezone || 'America/Chicago';
  const z = zoned(atMs, tz);
  const slots = Array.isArray(site.hours[z.weekday]) ? site.hours[z.weekday] : [];
  const minutes = z.h * 60 + z.mi;
  for (const s of slots) {
    const [oh, om] = String(s.open).split(':').map(Number), [ch, cm] = String(s.close).split(':').map(Number);
    if (minutes >= oh * 60 + om && minutes < ch * 60 + cm) return localToUtc(z.date, s.open, tz);
  }
  return null;
}

// Rescue timing inputs from a pickup document (and its site, when loaded).
const toMs = (v) => (v?.toMillis ? v.toMillis() : typeof v === 'string' ? Date.parse(v) : Number.isFinite(v) ? v : NaN);
function tripInputs(pickup, site) {
  const d = pickup?.destination_confirmation || {};
  const arrivalBy = toMs(d.arrival_by);
  return {
    readyAt: toMs(pickup?.scheduled_for ?? pickup?.ready_at),
    pickupBy: toMs(d.pickup_by ?? pickup?.pickup_window_until),
    arrivalBy,
    siteOpensAt: site ? siteOpensBefore(site, arrivalBy) : null,
    donor: Number.isFinite(pickup?.restaurant_lat) && Number.isFinite(pickup?.restaurant_lng) ? [pickup.restaurant_lat, pickup.restaurant_lng] : null,
    site: Number.isFinite(pickup?.fridge_lat) && Number.isFinite(pickup?.fridge_lng) ? [pickup.fridge_lat, pickup.fridge_lng] : null,
  };
}

// Donor → site leg for a travel mode: road time when the provider answers,
// otherwise a labeled straight-line estimate, otherwise unknown.
async function siteLeg(routing, inputs, profile) {
  if (!inputs.donor || !inputs.site) return null;
  try {
    const r = await routing.matrix({ origins: [inputs.donor], destination: inputs.site, profile });
    if (Number.isFinite(r?.seconds?.[0])) return leg(Math.ceil(r.seconds[0] / 60), 'road');
  } catch { /* fall through to the estimate */ }
  return leg(approximateMinutes(greatCircleDistance(inputs.donor, inputs.site, 'km'), profile), 'approximate');
}

// Volunteer → donor legs for many volunteer area cells at once, by mode.
// Returns Map key `${profile}|${cell}` → leg.
async function pickupLegs(routing, inputs, wants) {
  const out = new Map();
  if (!inputs.donor) return { legs: out, status: 'no_donor_location' };
  const byProfile = new Map();
  for (const { cell, profile } of wants) {
    if (!byProfile.has(profile)) byProfile.set(profile, new Set());
    byProfile.get(profile).add(cell);
  }
  const statuses = [];
  for (const [profile, cellSet] of byProfile) {
    const cells = [...cellSet];
    let r;
    try { r = await routing.matrix({ origins: cells.map((c) => cellToLatLng(c)), destination: inputs.donor, profile }); }
    catch { r = { status: 'unavailable', error: 'network', seconds: [] }; }
    statuses.push(r.status === 'ok' ? 'road' : r.status === 'partial' ? 'partial' : 'approximate');
    cells.forEach((c, i) => {
      const s = r?.seconds?.[i];
      out.set(`${profile}|${c}`, Number.isFinite(s) ? leg(Math.ceil(s / 60), 'road')
        : leg(approximateMinutes(greatCircleDistance(cellToLatLng(c), inputs.donor, 'km'), profile), 'approximate'));
    });
  }
  const status = !statuses.length ? 'none' : statuses.every((s) => s === 'road') ? 'road' : statuses.every((s) => s === 'approximate') ? 'approximate' : 'mixed';
  return { legs: out, status };
}

module.exports = { journey, siteOpensBefore, tripInputs, siteLeg, pickupLegs, travelProfile, approximateMinutes };
