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
const { journey, tripInputs, travelProfile, approximateMinutes } = require('./rescueMatching');
const D = require('./rescueDispatch');

const ms = (v) => (v?.toMillis ? v.toMillis() : typeof v === 'string' ? Date.parse(v) : NaN);
const rolesOf = (u) => [u?.role, ...(Array.isArray(u?.roles) ? u.roles : [])];
const fail = (message, reason) => new HttpsError('failed-precondition', message, { reason });

async function respond(db, data, uid, { now = Date.now(), advance = D.advance } = {}) {
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const pickupId = typeof data?.pickupId === 'string' ? data.pickupId : '';
  const response = data?.response;
  const offerId = typeof data?.offerId === 'string' ? data.offerId : null;
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
    if (offerId && offer && offer.offer_id && offer.offer_id !== offerId) throw fail('That offer was replaced by a newer one.', 'stale_offer');
    if (offerId && !offer) throw fail('That offer is no longer current.', 'stale_offer');
    if (response === 'decline') {
      if (!offer) throw fail('There is no offer to decline.', 'no_offer');
      if (offer.status === 'declined') return { ok: true, cached: true };
      if (offer.status !== 'open') throw fail('This offer already closed.', 'offer_closed');
      const noteRef = db.collection('notifications').doc(offer.notification_id);
      const note = await tx.get(noteRef);
      tx.update(offerRef, { status: 'declined', closed_at: Timestamp.fromMillis(now) });
      if (p.offer_hold?.offer_id === offer.offer_id) tx.update(pickupRef, { offer_hold: null });
      if (note.exists) tx.update(noteRef, { 'data.offer_status': 'declined', read: true });
      return { ok: true, declined: true };   // declining is never penalised
    }

    // ── accept ──
    if (offer && offer.status !== 'open') throw fail(offer.status === 'expired' ? 'This offer expired.' : 'This offer already closed.', offer.status === 'expired' ? 'offer_expired' : 'offer_closed');
    if (offer && ms(offer.expires_at) <= now) throw fail('This offer expired.', 'offer_expired');
    if (!D.offerIsOpen(p, now)) {
      if (p.claimed_by) throw fail('Another volunteer already took this rescue.', 'taken');
      if (p.status === 'available' && !p.destination_confirmation?.site_id) throw fail('This rescue doesn’t have a confirmed receiving site yet.', 'no_destination');
      if (p.status === 'available' && !(D.offerDeadline(p) > now)) throw fail('The pickup window has closed.', 'window_closed');
      if (p.safety_hold) throw fail('This rescue is on hold for a coordinator.', 'on_hold');
      throw fail('This rescue is no longer open.', 'closed');
    }
    // Exclusivity: while someone else holds a live offer, nobody else can take it.
    if (generation) {
      const live = await tx.get(pickupRef.collection('offers').where('generation', '==', generation).where('status', '==', 'open'));
      if (live.docs.some((o) => o.data().uid !== uid && ms(o.data().expires_at) > now)) {
        throw fail('This rescue is offered to another volunteer right now. It may come back to you.', 'offered_elsewhere');
      }
    }
    if (!user || !pickupEligible(user)) throw fail('An approved account, ID, volunteer agreement and driver setup are required.', 'ineligible');
    if (user.chapter_id !== p.chapter_id) throw fail('This rescue belongs to another chapter.', 'other_chapter');
    if ([p.receiver_uid, p.restaurant_id, p.restaurant_user_id].includes(uid)) throw fail('You’re part of this rescue in another role.', 'conflict');
    if (rolesOf(user).some((r) => ['restaurant', 'partner'].includes(r)) &&
        (await tx.get(db.doc(`restaurants/${p.restaurant_id}`))).data()?.user_id === uid) throw fail('Donors can’t collect their own donation.', 'conflict');
    if (cargoFit(p, user).status === 'does_not_fit') throw fail('This load doesn’t fit your vehicle details.', 'does_not_fit');
    const busy = await tx.get(db.collection('pickups').where('claimed_by', '==', uid).where('status', 'in', ['claimed', 'enroute']).limit(1));
    if (!busy.empty) throw fail('Finish your current rescue first.', 'busy');
    const siteId = p.destination_confirmation.site_id;
    const [resSnap, siteSnap] = await tx.getAll(db.doc(`receiving_sites/${siteId}/reservations/${pickupId}`), db.doc(`receiving_sites/${siteId}`));
    if (!D.reservationUsable(resSnap.data(), now)) {
      throw fail('The receiving site’s capacity hold lapsed. A coordinator needs to reconfirm it.', 'reservation');
    }
    const site = siteSnap.data();
    if (!site || (site.status === 'paused' && !(ms(site.paused_until) <= now))) throw fail('The receiving site is paused. A coordinator needs to pick another.', 'site_paused');
    // Complete journey from the volunteer's shared area. An offer carries
    // the trip legs computed when it was made; a direct take uses labeled
    // straight-line estimates. Without a shared area, timing can't be
    // checked, so the volunteer is asked to share it first.
    const avail = availSnap.data();
    const inputs = tripInputs(p, site);
    const { profile } = travelProfile(user);
    let toPickup = null, toSite = null;
    if (offer?.trip && Number.isFinite(offer.trip.to_pickup_minutes) && Number.isFinite(offer.trip.to_site_minutes)) {
      toPickup = { minutes: offer.trip.to_pickup_minutes, basis: offer.trip.legs?.to_pickup || 'approximate' };
      toSite = { minutes: offer.trip.to_site_minutes, basis: offer.trip.legs?.to_site || 'approximate' };
    } else {
      if (!avail?.cell || !(ms(avail.updated_at) > now - D.AVAILABILITY_MS)) {
        throw fail('Share your current area on the Rescues map so we can check you can make both stops in time.', 'area_needed');
      }
      if (inputs.donor) toPickup = { minutes: approximateMinutes(greatCircleDistance(inputs.donor, cellToLatLng(avail.cell), 'km'), profile), basis: 'approximate' };
      if (inputs.donor && inputs.site) toSite = { minutes: approximateMinutes(greatCircleDistance(inputs.donor, inputs.site, 'km'), profile), basis: 'approximate' };
    }
    const trip = journey({ now, toPickup, toSite, readyAt: inputs.readyAt, pickupBy: inputs.pickupBy, arrivalBy: inputs.arrivalBy, siteOpensAt: inputs.siteOpensAt });
    if (trip.feasible === null) throw fail('Travel time to one of the stops is unknown, so a coordinator needs to assign this rescue.', 'feasibility_unknown');
    if (trip.feasible === false) throw fail('From your area you can’t make the pickup and drop-off in time.', 'cannot_make_it');
    const donorUid = p.restaurant_id && !String(p.restaurant_id).includes('/')
      ? (await tx.get(db.doc(`restaurants/${p.restaurant_id}`))).data()?.user_id || null : null;

    tx.update(pickupRef, { status: 'claimed', claimed_by: uid, claimed_at: FieldValue.serverTimestamp(),
      claimant_name: user.name || user.full_name || '', claimant_phone: user.phone || '',
      claimed_via: offer ? 'offer' : 'direct', offer_hold: null,
      claim_trip: { basis: trip.basis, profile, to_pickup_minutes: trip.toPickupMinutes, to_site_minutes: trip.toSiteMinutes,
        margin_minutes: trip.marginMinutes, planned_finish_at: Timestamp.fromMillis(trip.finishAt) } });
    if (offer) tx.update(offerRef, { status: 'accepted', closed_at: Timestamp.fromMillis(now) });
    if (donorUid) {
      D.writeNotice(tx, db, `pickup_claimed_${D.safeId(pickupId)}_${D.safeId(generation || 'direct')}_${D.safeId(uid)}`, {
        uid: donorUid, kind: 'pickup', title: 'A volunteer is coming',
        body: `${user.name || user.full_name || 'A volunteer'} accepted your donation and is heading to you.`,
        url: D.pickupUrl(pickupId), data: { type: 'pickup_claimed_restaurant', pickupId },
      });
    }
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
