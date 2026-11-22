// Donor → receiving partner requests (a BN adaptation of a connected
// donor/recipient network; not a Project Green Fork workflow).
//
// pickups/{id}.partner_request
//   mode: preferred | network
//   site_id (preferred only), site_name
//   respond_by (Timestamp), offer_to_network (donor's explicit choice for
//   what happens if the preferred partner declines or doesn't answer)
//   status: awaiting_partner | accepted | declined | expired | withdrawn
//   history: [{ site_id, outcome, reason, at }]
//
// A preference is a request, never guaranteed acceptance: the destination
// is only confirmed when a partner's receiver accepts, through the same
// reserve-and-confirm transaction coordinators use. Recipient acceptance
// comes before, and is separate from, driver dispatch.
const { FieldValue, Timestamp } = require('firebase-admin/firestore');
const { HttpsError } = require('firebase-functions/v1/https');
const S = require('./receivingSites');
const { POLICY } = require('./lib/rescuePolicy');

const MINUTE = 60_000;
// Partners answer within 30 minutes at most, and never later than 15
// minutes before the donor's pickup window ends.
const DEFAULT_RESPOND_MIN = POLICY.PARTNER_MAX_RESPONSE_MIN;
const LATEST_BEFORE_END_MS = POLICY.PARTNER_LATEST_BEFORE_PICKUP_END_MIN * MINUTE;
const respondDeadline = (now, pickup, minutes = DEFAULT_RESPOND_MIN) =>
  Math.min(now + Math.min(minutes, POLICY.PARTNER_MAX_RESPONSE_MIN) * MINUTE, ms(pickup.pickup_window_until) - LATEST_BEFORE_END_MS);
const ms = (v) => (v?.toMillis ? v.toMillis() : typeof v === 'string' ? Date.parse(v) : Number.isFinite(v) ? v : NaN);
const url = (id) => `https://app.betternatureofficial.org/#/pickups/${encodeURIComponent(id)}`;

function notice(tx, db, id, uid, title, body, pickupId, type) {
  if (!uid) return;
  const row = { user_id: uid, kind: 'pickup', title, body, url: url(pickupId), data: { type, pickupId },
    created_at: FieldValue.serverTimestamp() };
  tx.set(db.collection('notifications').doc(id), { ...row, read: false });
  tx.set(db.collection('notifications_outbox').doc(id), { ...row, status: 'queued', attempts: 0, idempotency_key: id });
}

async function isDonor(tx, db, pickup, uid) {
  if (!pickup?.restaurant_id || String(pickup.restaurant_id).includes('/')) return false;
  if (pickup.restaurant_id === uid) return true;
  return (await tx.get(db.doc(`restaurants/${pickup.restaurant_id}`))).data()?.user_id === uid;
}

// Sites a donor can choose from: name and type only, active, own chapter.
async function listPartnerSites(db, data, uid) {
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const user = (await db.doc(`users/${uid}`).get()).data();
  if (!user?.chapter_id) return { sites: [] };
  const snap = await db.collection('receiving_sites').where('chapter_id', '==', user.chapter_id).get();
  return {
    sites: snap.docs.filter((d) => !S.isPaused(d.data(), Date.now()) && d.data().receiver_uid)
      .map((d) => ({ id: d.id, name: d.data().name, type: d.data().type, food_categories: d.data().food_categories || null }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

// Donor asks a preferred partner (or the network) to take this donation.
async function requestPartner(db, data, uid, { now = Date.now() } = {}) {
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const pickupId = typeof data?.pickupId === 'string' ? data.pickupId : '';
  const mode = data?.mode;
  const siteId = typeof data?.siteId === 'string' ? data.siteId : null;
  const respondMin = Math.min(POLICY.PARTNER_MAX_RESPONSE_MIN, Math.max(5, parseInt(data?.respondWithinMin, 10) || DEFAULT_RESPOND_MIN));
  if (!pickupId || pickupId.includes('/') || !['preferred', 'network'].includes(mode) || (mode === 'preferred' && (!siteId || siteId.includes('/')))) {
    throw new HttpsError('invalid-argument', 'Choose a partner or the BN network.');
  }
  const pickupRef = db.doc(`pickups/${pickupId}`);
  return db.runTransaction(async (tx) => {
    const pickup = (await tx.get(pickupRef)).data();
    if (!pickup) throw new HttpsError('not-found', 'Donation not found.');
    if (!(await isDonor(tx, db, pickup, uid))) throw new HttpsError('permission-denied', 'Only the donor can choose a receiving partner.');
    if (pickup.status !== 'pending_destination' || pickup.destination_confirmation) {
      throw new HttpsError('failed-precondition', 'This donation already has a destination or is underway.');
    }
    if (pickup.partner_request?.status === 'awaiting_partner') {
      const same = pickup.partner_request.mode === mode && (pickup.partner_request.site_id || null) === siteId;
      if (same) return { ok: true, cached: true };
      throw new HttpsError('failed-precondition', 'A partner is already considering this donation.');
    }
    let site = null;
    if (mode === 'preferred') {
      site = (await tx.get(db.doc(`receiving_sites/${siteId}`))).data();
      if (!site || site.chapter_id !== pickup.chapter_id || !site.receiver_uid) {
        throw new HttpsError('failed-precondition', 'That partner can’t take requests right now.');
      }
    }
    const respondBy = respondDeadline(now, pickup, respondMin);
    if (!(respondBy > now)) throw new HttpsError('failed-precondition', 'The pickup window is too close to ask a partner first.');
    tx.update(pickupRef, { partner_request: {
      mode, site_id: siteId, site_name: site?.name || null, respond_by: Timestamp.fromMillis(respondBy),
      offer_to_network: mode === 'network' ? true : data?.offerToNetwork === true,
      status: 'awaiting_partner', requested_by: uid, requested_at: Timestamp.fromMillis(now),
      history: pickup.partner_request?.history || [],
    } });
    if (site) {
      notice(tx, db, `partner_req_${pickupId}_${siteId}_${now}`, site.receiver_uid, 'Donation offered to your site',
        `${pickup.restaurant_name || 'A donor'} would like to send food to ${site.name}. Accept or decline by ${new Date(respondBy).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: site.timezone || 'America/Chicago' })}.`,
        pickupId, 'partner_request');
    }
    return { ok: true, respond_by: new Date(respondBy).toISOString() };
  });
}

// What happens when a preferred partner declines or doesn't answer.
function afterNoAnswer(tx, db, pickupRef, pickup, outcome, reason, now) {
  const req = pickup.partner_request;
  const history = [...(req.history || []), { site_id: req.site_id || null, outcome, reason: reason || null, at: Timestamp.fromMillis(now) }];
  if (req.mode === 'preferred' && req.offer_to_network) {
    tx.update(pickupRef, { partner_request: { ...req, mode: 'network', site_id: null, site_name: null, status: 'awaiting_partner',
      respond_by: Timestamp.fromMillis(respondDeadline(now, pickup)), history } });
    return 'network';
  }
  tx.update(pickupRef, { partner_request: { ...req, status: outcome, history } });
  return outcome;
}

// Partner's receiver (or a coordinator) accepts or declines.
async function respondPartner(db, data, uid, { now = Date.now() } = {}) {
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const pickupId = typeof data?.pickupId === 'string' ? data.pickupId : '';
  const response = data?.response;
  if (!pickupId || pickupId.includes('/') || !['accept', 'decline'].includes(response)) {
    throw new HttpsError('invalid-argument', 'Accept or decline the donation.');
  }
  const pickupRef = db.doc(`pickups/${pickupId}`);
  if (response === 'decline') {
    const reason = typeof data?.reason === 'string' ? data.reason.trim().slice(0, 200) : '';
    return db.runTransaction(async (tx) => {
      const pickup = (await tx.get(pickupRef)).data();
      const req = pickup?.partner_request;
      if (!req || req.status !== 'awaiting_partner') throw new HttpsError('failed-precondition', 'This request is no longer open.');
      const site = req.site_id ? (await tx.get(db.doc(`receiving_sites/${req.site_id}`))).data() : null;
      const caller = (await tx.get(db.doc(`users/${uid}`))).data();
      const mine = site ? site.receiver_uid === uid : false;
      if (!mine && !S.canCoordinate(caller, pickup.chapter_id)) {
        throw new HttpsError('permission-denied', 'Only the requested partner can decline.');
      }
      if (req.mode === 'network' && !S.canCoordinate(caller, pickup.chapter_id)) {
        return { ok: true, passed: true };   // a network partner passing doesn't close the request for others
      }
      const donor = (await tx.get(db.doc(`restaurants/${pickup.restaurant_id}`))).data()?.user_id;
      const next = afterNoAnswer(tx, db, pickupRef, pickup, 'declined', reason, now);
      notice(tx, db, `partner_decl_${pickupId}_${now}`, donor, next === 'network' ? 'Offered to other partners' : 'Partner couldn’t take this donation',
        next === 'network' ? `${req.site_name || 'Your preferred partner'} couldn’t take it, so it’s now offered to other BN receiving partners, as you allowed.`
          : `${req.site_name || 'Your preferred partner'} couldn’t take it${reason ? ` (${reason})` : ''}. Choose another partner or offer it to the network.`,
        pickupId, 'partner_declined');
      return { ok: true, next };
    });
  }
  // accept: confirm destination + reserve capacity, authorised for the
  // requested site's receiver (preferred) or any active site's receiver
  // in the chapter (network).
  const siteId = typeof data?.siteId === 'string' ? data.siteId : null;
  const arrivalBy = Number(data?.arrivalBy);
  const pickup = (await pickupRef.get()).data();
  const req = pickup?.partner_request;
  if (!req || req.status !== 'awaiting_partner') {
    if (req?.status === 'accepted' && pickup?.destination_confirmation?.site_id === siteId) return { ok: true, cached: true };
    throw new HttpsError('failed-precondition', 'This request is no longer open.');
  }
  if (ms(req.respond_by) <= now) throw new HttpsError('failed-precondition', 'The response window has closed.', { reason: 'expired' });
  const chosen = req.mode === 'preferred' ? req.site_id : siteId;
  if (!chosen || chosen.includes('/')) throw new HttpsError('invalid-argument', 'Choose which of your sites will receive it.');
  const result = await S.confirmDestination(db, { pickupId, siteId: chosen, arrivalBy }, uid, {
    now,
    authorize: (caller, pk, site, callerUid) => (site && site.receiver_uid === callerUid && site.chapter_id === pk.chapter_id &&
      pk.partner_request?.status === 'awaiting_partner' && ms(pk.partner_request.respond_by) > now &&
      (pk.partner_request.mode === 'network' || pk.partner_request.site_id === chosen))
      || S.canCoordinate(caller, pk.chapter_id),
    extraUpdate: (pk, site) => ({ partner_request: { ...pk.partner_request, status: 'accepted', accepted_by: uid,
      accepted_site_id: chosen, accepted_site_name: site.name, accepted_at: Timestamp.fromMillis(now) } }),
  });
  return { ...result, accepted: true };
}

// Scheduler: preferred/network requests nobody answered.
async function expirePartnerRequests(db, { now = Date.now(), limit = 50 } = {}) {
  const snap = await db.collection('pickups').where('partner_request.status', '==', 'awaiting_partner')
    .where('partner_request.respond_by', '<=', Timestamp.fromMillis(now)).limit(limit).get();
  let moved = 0;
  for (const d of snap.docs) {
    const done = await db.runTransaction(async (tx) => {
      const pickup = (await tx.get(d.ref)).data();
      const req = pickup?.partner_request;
      if (req?.status !== 'awaiting_partner' || !(ms(req.respond_by) <= now)) return false;
      const donor = (await tx.get(db.doc(`restaurants/${pickup.restaurant_id}`))).data()?.user_id;
      const next = afterNoAnswer(tx, db, d.ref, pickup, 'expired', 'no_response', now);
      notice(tx, db, `partner_exp_${d.id}_${ms(req.respond_by)}`, donor,
        next === 'network' ? 'Offered to other partners' : 'No partner answered in time',
        next === 'network' ? 'Your preferred partner didn’t answer in time, so it’s now offered to other BN receiving partners, as you allowed.'
          : 'Nobody accepted this donation before the response deadline. A coordinator can help, or you can offer it to the network.',
        d.id, 'partner_expired');
      return true;
    });
    if (done) moved++;
  }
  return { moved };
}

module.exports = { listPartnerSites, requestPartner, respondPartner, expirePartnerRequests };
