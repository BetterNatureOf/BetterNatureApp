// Shared alert helpers used by sendPushOnNotification. Dispatch rounds
// live in rescueDispatch.js.

const KIND = 'pickup_alert';

function deadline(value) {
  return value?.toMillis ? value.toMillis() : typeof value === 'string' ? Date.parse(value) : NaN;
}

function offerDeadline(pickup) {
  return Math.min(deadline(pickup.destination_confirmation?.pickup_by ?? pickup.pickup_window_until),
    deadline(pickup.destination_confirmation?.arrival_by));
}

function offerIsOpen(pickup, now = Date.now()) {
  return pickup?.status === 'available' && !!pickup.chapter_id && !pickup.claimed_by &&
    !pickup.safety_hold && !pickup.verified_by_restaurant_at && !pickup.handoff_from_uid &&
    offerDeadline(pickup) > now;
}

function wantsPickupAlert(user, chapterId) {
  return user?.chapter_id === chapterId && !user.disabled && !user.deleted_at &&
    !['pending', 'rejected'].includes(user.member_status) && user.notif_pickup !== false &&
    user.verification_status === 'approved' && user.contract_volunteer_signed === true &&
    ![user.role, ...(user.roles || [])].some((role) => ['restaurant', 'partner'].includes(role));
}

module.exports = { KIND, offerDeadline, offerIsOpen, wantsPickupAlert };
