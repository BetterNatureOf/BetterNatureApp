// Volunteer responses to rescue offers, and direct acceptance from the
// map/list. Everything is re-checked inside one transaction at the moment
// of acceptance — the offer (if any), the rescue's state and deadlines,
// the volunteer's eligibility, vehicle fit and other assignments, the
// receiving reservation, and (when the volunteer shared their area) the
// complete journey. Exactly one volunteer can win.
const { FieldValue, Timestamp } = require('firebase-admin/firestore');
const { HttpsError } = require('firebase-functions/v1/https');
const { cellToLatLng, greatCircleDistance } = require('h3-js');
const { pickupEligible } = require('./lib/pickupEligibility');
const { cargoFit } = require('./lib/rescueCargo');
const { journey, approximateMinutes } = require('./rescueMatching');
const D = require('./rescueDispatch');

const ms = (v) => (v?.toMillis ? v.toMillis() : typeof v === 'string' ? Date.parse(v) : NaN);
const rolesOf = (u) => [u?.role, ...(Array.isArray(u?.roles) ? u.roles : [])];
const fail = (message, reason) => new HttpsError('failed-precondition', message, { reason });

async function respond(db, data, uid, { now = Date.now(), advance = D.advance } = {}) {
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const pickupId = typeof data?.pickupId === 'string' ? data.pickupId : '';
  const response = data?.response;
  if (!pickupId || pickupId.includes('/') || !['accept', 'decline'].includes(response)) {
    throw new HttpsError('invalid-argument', 'Choose a rescue and accept or decline.');
  }
  const pickupRef = db.doc(`pickups/${pickupId}`);
  const stateRef = pickupRef.collection('dispatch').doc('state');
  const userRef = db.doc(`users/${uid}`);
  const availRef = db.doc(`rescue_availability/${uid}`);

  const out = await db.runTransaction(async (tx) => {
    const [pkSnap, stSnap, userSnap, availSnap] = await tx.getAll(pickupRef, stateRef, userRef, availRef);
    const p = pkSnap.data(), st = stSnap.data(), user = userSnap.data();
    if (!p) throw new HttpsError('not-found', 'Rescue not found.');
    const generation = st?.generation || null;
    const offerRef = generation ? pickupRef.collection('offers').doc(`${D.safeId(generation)}_${D.safeId(uid)}`) : null;
    const offerSnap = offerRef ? await tx.get(offerRef) : null;
    const offer = offerSnap?.exists ? offerSnap.data() : null;

    // Replays are answered from what already happened.
    if (response === 'accept' && p.claimed_by === uid && ['claimed', 'enroute'].includes(p.status)) return { ok: true, cached: true };
    if (response === 'decline') {
      if (!offer) throw fail('There is no offer to decline.', 'no_offer');
      if (offer.status === 'declined') return { ok: true, cached: true };
      if (offer.status !== 'open') throw fail('This offer already closed.', 'offer_closed');
      const noteRef = db.collection('notifications').doc(offer.notification_id);
      const note = await tx.get(noteRef);
      tx.update(offerRef, { status: 'declined', closed_at: Timestamp.fromMillis(now) });
      if (note.exists) tx.update(noteRef, { 'data.offer_status': 'declined', read: true });
      return { ok: true, declined: true };   // declining is never penalised
    }

    // ── accept ──
    if (offer && offer.status !== 'open') throw fail('This offer already closed.', 'offer_closed');
    if (offer && ms(offer.expires_at) <= now) throw fail('This offer expired.', 'offer_expired');
    if (!D.offerIsOpen(p, now)) {
      throw fail(p.claimed_by ? 'Another volunteer already took this rescue.' : 'This rescue is no longer open.', p.claimed_by ? 'taken' : 'closed');
    }
    if (!user || !pickupEligible(user)) throw fail('An approved account, ID, volunteer agreement and driver setup are required.', 'ineligible');
    if (user.chapter_id !== p.chapter_id) throw fail('This rescue belongs to another chapter.', 'other_chapter');
    if ([p.receiver_uid, p.restaurant_id, p.restaurant_user_id].includes(uid)) throw fail('You’re part of this rescue in another role.', 'conflict');
    if (rolesOf(user).some((r) => ['restaurant', 'partner'].includes(r)) &&
        (await tx.get(db.doc(`restaurants/${p.restaurant_id}`))).data()?.user_id === uid) throw fail('Donors can’t collect their own donation.', 'conflict');
    if (cargoFit(p, user).status === 'does_not_fit') throw fail('This load doesn’t fit your vehicle details.', 'does_not_fit');
    const busy = await tx.get(db.collection('pickups').where('claimed_by', '==', uid).where('status', 'in', ['claimed', 'enroute']).limit(1));
    if (!busy.empty) throw fail('Finish your current rescue first.', 'busy');
    const siteId = p.destination_confirmation?.site_id;
    if (siteId) {
      const res = (await tx.get(db.doc(`receiving_sites/${siteId}/reservations/${pickupId}`))).data();
      if (res?.status !== 'held') throw fail('The receiving site’s reservation lapsed. A coordinator needs to reconfirm it.', 'reservation');
    }
    // Journey: checked when the volunteer shared their area; otherwise the
    // volunteer accepts against the displayed cutoffs (no fake ETA).
    const avail = availSnap.data();
    const pickupBy = ms(p.destination_confirmation?.pickup_by ?? p.pickup_window_until);
    const arrivalBy = ms(p.destination_confirmation?.arrival_by);
    if (avail?.cell && ms(avail.updated_at) > now - D.AVAILABILITY_MS && Number.isFinite(p.restaurant_lat)) {
      const km = greatCircleDistance([p.restaurant_lat, p.restaurant_lng], cellToLatLng(avail.cell), 'km');
      const toPickup = offer?.trip?.basis === 'road' && Number.isFinite(offer.trip.to_pickup_minutes)
        ? { minutes: offer.trip.to_pickup_minutes, basis: 'road' } : { minutes: approximateMinutes(km), basis: 'approximate' };
      const toSite = Number.isFinite(p.fridge_lat) && Number.isFinite(p.fridge_lng)
        ? { minutes: approximateMinutes(greatCircleDistance([p.restaurant_lat, p.restaurant_lng], [p.fridge_lat, p.fridge_lng], 'km')), basis: 'approximate' } : null;
      const trip = journey({ now, toPickup, toSite, pickupBy, arrivalBy });
      if (trip.feasible === false) throw fail('From your shared area you can’t make the pickup and drop-off in time.', 'cannot_make_it');
    }

    tx.update(pickupRef, { status: 'claimed', claimed_by: uid, claimed_at: FieldValue.serverTimestamp(),
      claimant_name: user.name || user.full_name || '', claimant_phone: user.phone || '',
      claimed_via: offer ? 'offer' : 'direct' });
    if (offer) tx.update(offerRef, { status: 'accepted', closed_at: Timestamp.fromMillis(now) });
    return { ok: true, accepted: true, generation };
  }).catch(async (error) => {
    if (error instanceof HttpsError) throw error;
    // Contention between simultaneous acceptances: report the outcome,
    // never a raw database error.
    const current = (await pickupRef.get()).data();
    if (current?.claimed_by && current.claimed_by !== uid) throw fail('Another volunteer already took this rescue.', 'taken');
    if (current?.claimed_by === uid) return { ok: true, cached: true };
    throw new HttpsError('unavailable', 'Busy right now — try again in a moment. Nothing was claimed.', { reason: 'contention' });
  });

  if (out.accepted && out.generation) {
    // Losing offers close and leave the actionable UI.
    await D.closeOffers(db, pickupRef, out.generation, 'withdrawn', now, uid);
  }
  if (out.declined) {
    // If nobody else holds a live offer, move on to the next candidate now.
    const st = (await stateRef.get()).data();
    const open = st ? await D.openOffers(db, pickupRef, st.generation) : [];
    if (!open.some((o) => ms(o.data().expires_at) > now)) {
      await stateRef.update({ next_action_at: Timestamp.fromMillis(now) }).catch(() => {});
      await advance(db, pickupRef, { now }).catch((e) => console.error('advance after decline', e));
    }
  }
  return out;
}

module.exports = { respond };
