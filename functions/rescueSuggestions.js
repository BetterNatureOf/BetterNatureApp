// Coordinator suggestions for one rescue: nearby, free, eligible
// volunteers with an honest account of what is known about each trip.
// Never claims or notifies anyone. Uses the shared cargo rules and,
// when every input is known (road times for both legs, site hours),
// the full rescueMatching evaluation.
const { HttpsError } = require('firebase-functions/v1/https');
const { latLngToCell, gridDisk, cellToLatLng, greatCircleDistance } = require('h3-js');
const { pickupEligible } = require('./lib/pickupEligibility');
const { cargoFit, rescueCargo, volunteerCargo } = require('./lib/rescueCargo');
const { journey, tripInputs, siteLeg, pickupLegs, travelProfile } = require('./rescueMatching');
const { routingProvider } = require('./dispatchRouting');
const { POLICY } = require('./lib/rescuePolicy');

const MINUTE = 60_000;
const AVAILABILITY_MS = 60 * MINUTE;
const RING = 7;
const LIMIT = 10;
const ms = (v) => (v?.toMillis ? v.toMillis() : typeof v === 'string' ? Date.parse(v) : NaN);
const rolesOf = (u) => [u?.role, ...(Array.isArray(u?.roles) ? u.roles : [])];

function canCoordinate(user, chapterId) {
  const roles = rolesOf(user);
  if (roles.some((r) => ['executive', 'admin', 'super_admin'].includes(r))) return true;
  return !!chapterId && user?.chapter_id === chapterId &&
    roles.some((r) => ['chapter_president', 'chapter_pres', 'chapter_vol_coord'].includes(r));
}

async function suggest(db, data, uid, { now = Date.now(), routing = routingProvider() } = {}) {
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const pickupId = typeof data?.pickupId === 'string' ? data.pickupId : '';
  if (!pickupId || pickupId.includes('/')) throw new HttpsError('invalid-argument', 'Choose a rescue.');
  const [callerSnap, pickupSnap] = await Promise.all([db.doc(`users/${uid}`).get(), db.doc(`pickups/${pickupId}`).get()]);
  const pickup = pickupSnap.data();
  if (!pickup) throw new HttpsError('not-found', 'Rescue not found.');
  if (!canCoordinate(callerSnap.data(), pickup.chapter_id)) {
    throw new HttpsError('permission-denied', 'Only this chapter’s coordinators can see suggestions.');
  }
  const assumptions = { loading_minutes: POLICY.LOADING_MIN, unloading_minutes: POLICY.UNLOADING_MIN,
    margin_minutes: { road: POLICY.MARGIN_ROAD_MIN, approximate: POLICY.MARGIN_APPROXIMATE_MIN },
    volunteer_available_until: 'receiving deadline', origin: 'volunteer’s shared area (approximate)' };
  const siteId = pickup.destination_confirmation?.site_id;
  const site = siteId ? (await db.doc(`receiving_sites/${siteId}`).get()).data() : null;
  const inputs = tripInputs(pickup, site);
  if (!inputs.donor) return { candidates: [], gaps: ['donor_location'], assumptions };
  const cells = gridDisk(latLngToCell(inputs.donor[0], inputs.donor[1], 7), RING);
  const fresh = [];
  for (let i = 0; i < cells.length; i += 30) {
    const snap = await db.collection('rescue_availability').where('cell', 'in', cells.slice(i, i + 30)).get();
    snap.docs.forEach((d) => {
      const t = ms(d.data().updated_at);
      if (t <= now && t > now - AVAILABILITY_MS) fresh.push({ uid: d.id, cell: d.data().cell });
    });
  }
  const people = [];
  for (const f of fresh) {
    if ([pickup.receiver_uid, pickup.restaurant_id, pickup.restaurant_user_id].includes(f.uid)) continue;
    const user = (await db.doc(`users/${f.uid}`).get()).data();
    if (!user || user.chapter_id !== pickup.chapter_id || !pickupEligible(user)) continue;
    if (rolesOf(user).some((r) => ['restaurant', 'partner'].includes(r))) continue;
    const busy = await db.collection('pickups').where('claimed_by', '==', f.uid)
      .where('status', 'in', ['claimed', 'enroute']).limit(1).get();
    if (!busy.empty) continue;
    people.push({ ...f, user, ...travelProfile(user) });
  }
  const { legs, status: routingStatus } = await pickupLegs(routing, inputs, people.map((x) => ({ cell: x.cell, profile: x.profile })));
  const siteLegs = new Map();
  for (const profile of new Set(people.map((x) => x.profile))) siteLegs.set(profile, await siteLeg(routing, inputs, profile));

  const candidates = people.map((x) => {
    const toPickup = legs.get(`${x.profile}|${x.cell}`) || null;
    const trip = journey({ now, toPickup, toSite: siteLegs.get(x.profile) || null, readyAt: inputs.readyAt,
      pickupBy: inputs.pickupBy, arrivalBy: inputs.arrivalBy, siteOpensAt: inputs.siteOpensAt });
    const fit = cargoFit(pickup, x.user);
    const km = greatCircleDistance(inputs.donor, cellToLatLng(x.cell), 'km');
    return { uid: x.uid, name: x.user.name || x.user.full_name || 'Volunteer', distance_km: +km.toFixed(1),
      travel_mode: x.profile, travel_mode_assumed: x.assumed,
      road_minutes: toPickup?.basis === 'road' ? toPickup.minutes : null,
      estimate_minutes: toPickup?.minutes ?? null, estimate_basis: toPickup?.basis || 'unknown',
      timing: trip.feasible === true ? 'can_make_it' : trip.feasible === false ? trip.reason : 'unknown',
      fit: fit.status, fit_problems: fit.problems, fit_unknown: fit.unknown,
      full_trip: trip.feasible === true ? { status: 'feasible', basis: trip.basis, slack_minutes: trip.slackMinutes, total_minutes: trip.totalMinutes, wait_minutes: trip.waitMinutes }
        : { status: trip.reason } };
  });
  const order = { fits: 0, unknown: 1, does_not_fit: 2 };
  const timingRank = (t) => (t === 'can_make_it' ? 0 : t === 'unknown' ? 1 : 2);
  candidates.sort((a, b) => timingRank(a.timing) - timingRank(b.timing) || order[a.fit] - order[b.fit] ||
    (a.estimate_minutes ?? Infinity) - (b.estimate_minutes ?? Infinity) || a.uid.localeCompare(b.uid));
  const gaps = [];
  if (people.length && routingStatus !== 'road') gaps.push('road_times');
  if (!pickup.food_category) gaps.push('food_category');
  if (!Number.isInteger(pickup.packages)) gaps.push('packages');
  if (!site) gaps.push('receiving_site_details');
  else if (!inputs.site) gaps.push('receiving_site_location');
  return { candidates: candidates.slice(0, LIMIT), gaps, assumptions, routing: routingStatus };
}

module.exports = { suggest, canCoordinate };
