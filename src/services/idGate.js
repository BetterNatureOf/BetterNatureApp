// Shared ID-verification gate. Returns true synchronously if the user has
// already uploaded an ID, otherwise prompts (cross-platform) and returns
// a promise the caller can await if they want to know which option the
// user picked. Either way: if not verified, the caller short-circuits.
//
// Restaurants are exempt — they're trusted via a business address +
// EIN, not personal ID. Only volunteers actually picking up food go
// through this gate.
import { Platform } from 'react-native';
import { confirm } from './ui';

// The ID + waiver gate. A volunteer can claim a pickup only if:
//   (a) they uploaded an ID AND it's been admin-approved
//   (b) they signed the latest version of the liability waiver
//
// Restaurants and partners skip ID upload (vetted via business address
// and EIN), but still need to sign the waiver if they're going to
// physically handle food in any of the joint workflows.
export function requireVerifiedId(user, navigation) {
  // Restaurants / partners: no personal ID required, no waiver
  // required (we cover them under the business agreement). Let through.
  if (user?.role === 'restaurant' || user?.role === 'partner') return true;

  // Missing ID upload.
  if (!user?.id_document_url) {
    (async () => {
      const ok = await confirm(
        'Verify your ID first',
        'For everyone’s safety, upload a photo of a government-issued ID before claiming food pickups.',
      );
      if (ok) navigation?.navigate?.('VerifyId');
    })();
    return false;
  }

  // Uploaded but not yet admin-approved.
  if (user.verification_status && user.verification_status !== 'approved') {
    (async () => {
      if (user.verification_status === 'rejected') {
        const ok = await confirm(
          'ID was rejected',
          'An admin couldn’t verify your last ID. Upload a clearer photo to try again.',
        );
        if (ok) navigation?.navigate?.('VerifyId');
      } else {
        await confirm(
          'Pending review',
          'An admin is reviewing your ID. You’ll be able to claim pickups as soon as it’s approved (usually within 24 hours).',
        );
      }
    })();
    return false;
  }

  // No waiver on file (or signed an older version).
  if (!user?.waiver_signed) {
    (async () => {
      const ok = await confirm(
        'Sign the waiver',
        'Quick liability waiver — required once per account before you can claim pickups.',
      );
      if (ok) navigation?.navigate?.('LiabilityWaiver');
    })();
    return false;
  }

  return true;
}
