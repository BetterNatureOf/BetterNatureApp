// One actionable list of rescues that need a coordinator: what's wrong,
// who owns the next step, what that step is, and the deadline that
// matters. Shared by the app's Rescue queue and the tests.
//
// Input: pickups (with an optional `dispatch` = dispatch/state data) and now.

const MINUTE = 60_000;
const NEAR_DEADLINE_MS = 30 * MINUTE;
const START_GRACE_MS = 0;              // claimed but not started past the cutoff = late

const ms = (v) => (v?.toMillis ? v.toMillis() : v?.seconds != null ? v.seconds * 1000
  : typeof v === 'string' ? Date.parse(v) : Number.isFinite(v) ? v : NaN);

const PRIORITY = {
  held: 0, remainder_pending: 1, escalated: 2, legacy_destination: 2, late_pickup: 3, late_delivery: 4,
  near_deadline: 5, awaiting_site: 6, awaiting_partner: 7, awaiting_receipt: 8, awaiting_donor: 9,
};

const HOLD_TEXT = {
  cannot_continue: 'Volunteer can’t continue',
  food_concern: 'Food safety concern',
  destination_unavailable: 'Receiving site unavailable',
};
const ESCALATION_TEXT = {
  no_acceptance: 'No volunteer accepted after every search round',
  no_feasible_volunteer: 'No available volunteer can make it in time',
  deadline_approaching: 'Deadline close and nobody has accepted',
  not_started: 'Assigned volunteer hasn’t started',
  destination_unusable: 'Receiving hold lapsed — reconfirm a site',
  feasibility_unknown: 'Travel time unknown — assign by hand',
  donor_location_missing: 'Donor location missing — assign by hand',
};

function classify(p, now) {
  const pickupBy = ms(p.destination_confirmation?.pickup_by ?? p.pickup_window_until);
  const arrivalBy = ms(p.destination_confirmation?.arrival_by);
  const offerDeadline = Math.min(pickupBy, Number.isFinite(arrivalBy) ? arrivalBy : Infinity);
  const claimant = p.claimant_name || 'Assigned volunteer';
  const d = p.dispatch || null;

  if (p.safety_hold && ['claimed', 'enroute'].includes(p.status)) {
    const reason = p.safety_hold.reason;
    return {
      kind: 'held', title: HOLD_TEXT[reason] || 'Rescue on hold', owner: 'Coordinator',
      next: reason === 'cannot_continue' ? (p.verified_by_restaurant_at ? 'Record a custody transfer or close the hold' : 'Release or close the hold')
        : reason === 'destination_unavailable' ? 'Confirm a backup receiving site' : 'Decide: return to donor or discard',
      deadline: arrivalBy, deadlineLabel: 'Receiving deadline',
    };
  }
  if (p.status === 'enroute' && Number(p.receiving_receipt?.rejected_weight_lbs) > 0 && !p.remainder_disposition) {
    return { kind: 'remainder_pending', title: `${p.receiving_receipt.rejected_weight_lbs} lb turned away`, owner: 'Coordinator',
      next: 'Record where the remaining food went', deadline: null, deadlineLabel: null };
  }
  // Older clients could open an offer with a typed-in destination and no
  // saved site. Those can't be claimed any more; a coordinator confirms a
  // site (which reserves capacity) or closes the rescue.
  if (p.status === 'available' && p.destination_confirmation && !p.destination_confirmation.site_id) {
    return { kind: 'legacy_destination', title: 'Destination isn’t a saved receiving site', owner: 'Coordinator',
      next: 'Confirm a saved site so volunteers can take it, or close the rescue', deadline: offerDeadline, deadlineLabel: 'Offer closes' };
  }
  if (p.status === 'available' && d?.escalation && d.status === 'escalated') {
    return { kind: 'escalated', title: ESCALATION_TEXT[d.escalation.reason] || 'Needs a decision', owner: 'Coordinator',
      next: 'Call a volunteer directly, adjust the window with the donor, or cancel', deadline: offerDeadline, deadlineLabel: 'Offer closes' };
  }
  if (p.status === 'claimed' && Number.isFinite(pickupBy) && now > pickupBy + START_GRACE_MS) {
    return { kind: 'late_pickup', title: `${claimant} hasn’t started and the pickup cutoff passed`, owner: claimant,
      next: p.verified_by_restaurant_at ? 'Call the volunteer' : 'Call the volunteer, or release the claim as a no-show',
      deadline: pickupBy, deadlineLabel: 'Pickup cutoff' };
  }
  if (p.status === 'enroute' && Number.isFinite(arrivalBy) && now > arrivalBy && !p.receiving_receipt) {
    return { kind: 'late_delivery', title: 'Past the receiving deadline without a receipt', owner: claimant,
      next: p.verified_by_restaurant_at ? 'Call the volunteer and the site. The site’s capacity stays held until a receipt or closure.'
        : 'Call the volunteer and the receiving site', deadline: arrivalBy, deadlineLabel: 'Receiving deadline' };
  }
  if (['pending_destination', 'available'].includes(p.status) && !p.destination_confirmation &&
      p.partner_request?.status === 'awaiting_partner') {
    const preferred = p.partner_request.mode === 'preferred';
    return { kind: 'awaiting_partner', title: preferred ? `Waiting for ${p.partner_request.site_name || 'the preferred partner'} to answer`
      : 'Offered to the partner network', owner: preferred ? (p.partner_request.site_name || 'Preferred partner') : 'Receiving partners',
      next: preferred && p.partner_request.offer_to_network ? 'Nothing yet — it goes to the network if they decline or don’t answer'
        : 'Nudge partners, or confirm a site yourself', deadline: ms(p.partner_request.respond_by), deadlineLabel: 'Partner answer due' };
  }
  if (['pending_destination', 'available'].includes(p.status) && !p.destination_confirmation) {
    const declined = ['declined', 'expired'].includes(p.partner_request?.status);
    return { kind: 'awaiting_site', title: declined ? 'Partner declined or didn’t answer' : 'Waiting for a receiving site', owner: 'Coordinator',
      next: 'Confirm where this food goes', deadline: pickupBy, deadlineLabel: 'Donor cutoff' };
  }
  if (p.status === 'available' && Number.isFinite(offerDeadline) && offerDeadline - now <= NEAR_DEADLINE_MS) {
    return { kind: 'near_deadline', title: 'Closing soon without a volunteer', owner: d ? `Dispatch · round ${d.round || 0}` : 'Dispatch',
      next: 'Watch it, or call a nearby volunteer', deadline: offerDeadline, deadlineLabel: 'Offer closes' };
  }
  if (p.status === 'enroute' && p.verified_by_restaurant_at && !p.receiving_receipt) {
    return { kind: 'awaiting_receipt', title: 'Waiting for the receiving site to confirm', owner: 'Receiving site',
      next: 'Nudge the site if it runs long', deadline: arrivalBy, deadlineLabel: 'Receiving deadline' };
  }
  if (['claimed', 'enroute'].includes(p.status) && !p.verified_by_restaurant_at && Number.isFinite(pickupBy) && now > pickupBy - NEAR_DEADLINE_MS) {
    return { kind: 'awaiting_donor', title: 'Donor hasn’t confirmed collection', owner: 'Donor',
      next: 'Check in with the donor', deadline: pickupBy, deadlineLabel: 'Pickup cutoff' };
  }
  return null;
}

function buildQueue(pickups, now = Date.now()) {
  const items = [];
  let healthy = 0;
  for (const p of pickups) {
    if (!['pending_destination', 'available', 'claimed', 'enroute'].includes(p.status)) continue;
    const c = classify(p, now);
    if (!c) { healthy++; continue; }
    items.push({ id: p.id, restaurant: p.restaurant_name || 'Food offer', status: p.status, ...c,
      minutesLeft: Number.isFinite(c.deadline) ? Math.round((c.deadline - now) / MINUTE) : null });
  }
  items.sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind] ||
    (a.deadline ?? Infinity) - (b.deadline ?? Infinity) || a.id.localeCompare(b.id));
  const counts = items.reduce((acc, i) => ({ ...acc, [i.kind]: (acc[i.kind] || 0) + 1 }), {});
  return { items, counts, healthy };
}

module.exports = { buildQueue, classify, PRIORITY };
