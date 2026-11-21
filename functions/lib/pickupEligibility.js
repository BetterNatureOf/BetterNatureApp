// Pure eligibility policy shared with the client adapter. Firestore rules
// independently enforce the same predicates; emulator tests cover parity.
const MEMBERSHIP_ROLES = ['executive', 'admin', 'super_admin', 'chapter_president', 'chapter_pres',
  'chapter_vp', 'chapter_treas', 'chapter_vol_coord', 'chapter_sec'];
function pickupEligible(user) {
  if (!user || user.disabled || user.deleted || user.deleted_at || user.merged_into
      || ['disabled', 'deleted', 'rejected', 'suspended'].includes(user.member_status)) return false;
  const roles = [user.role, ...(Array.isArray(user.roles) ? user.roles : [])];
  if (roles.some((role) => ['restaurant', 'partner'].includes(role))) return user.restaurant_status === 'approved';
  return (user.member_status === 'approved' || roles.some((role) => MEMBERSHIP_ROLES.includes(role)))
    && user.verification_status === 'approved' && user.contract_volunteer_signed === true
    && user.driver_setup_complete === true;
}
module.exports = { pickupEligible, MEMBERSHIP_ROLES };
