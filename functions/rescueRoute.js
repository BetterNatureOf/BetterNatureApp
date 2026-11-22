// Route preview for an accepted rescue (Mapbox Directions through the
// routing provider). Returned on demand, not stored. Only the assigned
// volunteer and chapter coordinators can ask. The first leg starts at the
// volunteer's shared approximate area, never a live position, and the
// result is a preview, not turn-by-turn navigation.
const { HttpsError } = require('firebase-functions/v1/https');
const { cellToLatLng } = require('h3-js');
const { routingProvider } = require('./dispatchRouting');
const { travelProfile, tripInputs } = require('./rescueMatching');
const { canCoordinate } = require('./receivingSites');

const AVAILABILITY_MS = 60 * 60_000;
const ms = (v) => (v?.toMillis ? v.toMillis() : typeof v === 'string' ? Date.parse(v) : NaN);

async function getRescueRoute(db, data, uid, { now = Date.now(), routing = routingProvider() } = {}) {
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const pickupId = typeof data?.pickupId === 'string' ? data.pickupId : '';
  if (!pickupId || pickupId.includes('/')) throw new HttpsError('invalid-argument', 'Choose a rescue.');
  const [pk, caller] = await Promise.all([db.doc(`pickups/${pickupId}`).get(), db.doc(`users/${uid}`).get()]);
  const p = pk.data();
  if (!p) throw new HttpsError('not-found', 'Rescue not found.');
  const claimant = p.claimed_by === uid;
  if (!claimant && !canCoordinate(caller.data(), p.chapter_id)) throw new HttpsError('permission-denied', 'Only the assigned volunteer or a coordinator can see this route.');
  if (!['claimed', 'enroute'].includes(p.status)) return { status: 'unavailable', error: 'not_active' };
  const inputs = tripInputs(p, null);
  if (!inputs.donor || !inputs.site) return { status: 'unavailable', error: 'missing_location' };
  const collected = !!p.verified_by_restaurant_at;
  const volunteer = (await db.doc(`users/${p.claimed_by}`).get()).data();
  const { profile, assumed } = travelProfile(volunteer);
  const coordinates = [inputs.donor, inputs.site];
  let origin = 'donor';
  if (!collected) {
    const avail = (await db.doc(`rescue_availability/${p.claimed_by}`).get()).data();
    if (avail?.cell && ms(avail.updated_at) > now - AVAILABILITY_MS) { coordinates.unshift(cellToLatLng(avail.cell)); origin = 'approximate_area'; }
  }
  const r = await routing.route({ coordinates, profile });
  if (r.status !== 'ok') return { status: 'unavailable', error: r.error || 'unavailable', profile };
  return { status: 'ok', provider: routing.name, profile, profile_assumed: assumed, origin, basis: 'road',
    traffic: 'not_traffic_aware', seconds: r.seconds, meters: r.meters, geometry: r.geometry,
    stops: coordinates.map(([lat, lng]) => [lng, lat]), collected };
}

module.exports = { getRescueRoute };
