// Coordinator suggestions for one rescue: nearby, free, eligible
// volunteers with an honest account of what is known about each trip.
// Never claims or notifies anyone. Uses the shared cargo rules and,
// when every input is known (road times for both legs, site hours),
// the full rescueMatching evaluation.
const { HttpsError } = require('firebase-functions/v1/https');
const { latLngToCell, gridDisk, cellToLatLng, greatCircleDistance } = require('h3-js');
const { pickupEligible } = require('./lib/pickupEligibility');
const { cargoFit, rescueCargo, volunteerCargo } = require('./lib/rescueCargo');
const { evaluateRescue } = require('./rescueMatching');
const { pickupRoadTimes } = require('./dispatchRouting');

const MINUTE = 60_000;
const AVAILABILITY_MS = 60 * MINUTE;
const RING = 7;
const LIMIT = 10;
const LOADING_MIN = 10;   // stated pilot assumption, shown in the response
const UNLOADING_MIN = 10;
const BUFFER_MIN = 10;
const ms = (v) => (v?.toMillis ? v.toMillis() : typeof v === 'string' ? Date.parse(v) : NaN);
const rolesOf = (u) => [u?.role, ...(Array.isArray(u?.roles) ? u.roles : [])];

function canCoordinate(user, chapterId) {
  const roles = rolesOf(user);
  if (roles.some((r) => ['executive', 'admin', 'super_admin'].includes(r))) return true;
  return !!chapterId && user?.chapter_id === chapterId &&
    roles.some((r) => ['chapter_president', 'chapter_pres', 'chapter_vol_coord'].includes(r));
}

async function suggest(db, data, uid, { now = Date.now(), roadTimes = pickupRoadTimes } = {}) {
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const pickupId = typeof data?.pickupId === 'string' ? data.pickupId : '';
  if (!pickupId || pickupId.includes('/')) throw new HttpsError('invalid-argument', 'Choose a rescue.');
  const [callerSnap, pickupSnap] = await Promise.all([db.doc(`users/${uid}`).get(), db.doc(`pickups/${pickupId}`).get()]);
  const pickup = pickupSnap.data();
  if (!pickup) throw new HttpsError('not-found', 'Rescue not found.');
  if (!canCoordinate(callerSnap.data(), pickup.chapter_id)) {
    throw new HttpsError('permission-denied', 'Only this chapter’s coordinators can see suggestions.');
  }
  const lat = pickup.restaurant_lat, lng = pickup.restaurant_lng;
  const assumptions = { loading_minutes: LOADING_MIN, unloading_minutes: UNLOADING_MIN, buffer_minutes: BUFFER_MIN,
    volunteer_available_until: 'receiving deadline' };
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { candidates: [], gaps: ['donor_location'], assumptions };
  }
  const cells = gridDisk(latLngToCell(lat, lng, 7), RING);
  const fresh = [];
  for (let i = 0; i < cells.length; i += 30) {
    const snap = await db.collection('rescue_availability').where('cell', 'in', cells.slice(i, i + 30)).get();
    snap.docs.forEach((d) => {
      const t = ms(d.data().updated_at);
      if (t <= now && t > now - AVAILABILITY_MS) fresh.push({ uid: d.id, cell: d.data().cell, updatedAt: t });
    });
  }
  const times = fresh.length ? await roadTimes([...new Set(fresh.map((f) => f.cell))].slice(0, 19), [lat, lng]) : new Map();
  const pickupBy = Math.min(ms(pickup.destination_confirmation?.pickup_by ?? pickup.pickup_window_until), Infinity);
  const arrivalBy = ms(pickup.destination_confirmation?.arrival_by);
  const site = pickup.receiving_site || null;   // filled in by the receiving-site model

  const candidates = [];
  for (const f of fresh) {
    if ([pickup.receiver_uid, pickup.restaurant_id, pickup.restaurant_user_id].includes(f.uid)) continue;
    const user = (await db.doc(`users/${f.uid}`).get()).data();
    if (!user || user.chapter_id !== pickup.chapter_id || !pickupEligible(user)) continue;
    if (rolesOf(user).some((r) => ['restaurant', 'partner'].includes(r))) continue;
    const busy = await db.collection('pickups').where('claimed_by', '==', f.uid)
      .where('status', 'in', ['claimed', 'enroute']).limit(1).get();
    if (!busy.empty) continue;
    const seconds = times.get(f.cell);
    const toPickupMin = seconds === undefined ? null : Math.round(seconds / 60);
    const km = greatCircleDistance([lat, lng], cellToLatLng(f.cell), 'km');
    let timing = 'unknown';
    if (toPickupMin !== null && Number.isFinite(pickupBy)) {
      timing = now + (toPickupMin + LOADING_MIN) * MINUTE <= pickupBy ? 'can_make_pickup' : 'too_far_for_pickup_cutoff';
    }
    const fit = cargoFit(pickup, user);
    // Full trip check only when every leg and the site's hours are known.
    let matching = { reason: 'missing_route_data' };
    if (site && toPickupMin !== null && Number.isFinite(site.to_site_minutes)) {
      matching = evaluateRescue({
        now,
        rescue: { id: pickupId, status: pickup.status, chapterId: pickup.chapter_id, readyAt: now,
          pickupBy, loadingMinutes: LOADING_MIN, handlingMinutes: null, ...rescueCargo(pickup) },
        site: { id: site.id, chapterId: pickup.chapter_id, approved: true, opensAt: ms(site.opens_at) || now,
          closesAt: Math.min(ms(site.closes_at) || Infinity, arrivalBy), unloadingMinutes: UNLOADING_MIN,
          foodCategories: site.food_categories || [], remainingPackages: site.remaining_packages ?? null },
        volunteer: { id: f.uid, chapterId: user.chapter_id, eligible: true, activeRescue: false,
          // No volunteer schedule exists yet: assume they're free through
          // the receiving deadline (stated in `assumptions`).
          availableUntil: arrivalBy, ...volunteerCargo(user),
          equipment: volunteerCargo(user).equipment || [] },
        travel: { toPickup: toPickupMin, toSite: site.to_site_minutes, buffer: BUFFER_MIN },
      });
    }
    candidates.push({ uid: f.uid, name: user.name || user.full_name || 'Volunteer', distance_km: +km.toFixed(1),
      road_minutes: toPickupMin, timing, fit: fit.status, fit_problems: fit.problems, fit_unknown: fit.unknown,
      full_trip: matching.reason ? { status: matching.reason } : { status: 'feasible', margin_minutes: Math.round(matching.marginMinutes) } });
  }
  const order = { fits: 0, unknown: 1, does_not_fit: 2 };
  const timingOrder = { can_make_pickup: 0, unknown: 1, too_far_for_pickup_cutoff: 2 };
  candidates.sort((a, b) => timingOrder[a.timing] - timingOrder[b.timing] || order[a.fit] - order[b.fit] ||
    (a.road_minutes ?? Infinity) - (b.road_minutes ?? Infinity) || a.distance_km - b.distance_km || a.uid.localeCompare(b.uid));
  const gaps = [];
  if (!times.size && fresh.length) gaps.push('road_times');
  if (!pickup.food_category) gaps.push('food_category');
  if (!Number.isInteger(pickup.packages)) gaps.push('packages');
  if (!site) gaps.push('receiving_site_details');
  return { candidates: candidates.slice(0, LIMIT), gaps, assumptions };
}

module.exports = { suggest, canCoordinate };
