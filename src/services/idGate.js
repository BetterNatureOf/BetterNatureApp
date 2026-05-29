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

export function requireVerifiedId(user, navigation) {
  // Restaurants don't need a personal ID upload.
  if (user?.role === 'restaurant' || user?.role === 'partner') return true;

  if (user?.id_document_url) return true;

  // Fire the prompt asynchronously. On web the previous
  // Alert.alert([{onPress}]) silently dropped its callbacks, so the
  // "Verify ID" button never fired and the user got stuck. confirm()
  // uses window.confirm on web and resolves to a real bool.
  (async () => {
    const ok = await confirm(
      'Verify your ID first',
      'For everyone’s safety, you need to upload a photo of a government-issued ID before claiming food pickups.',
    );
    if (ok) navigation?.navigate?.('VerifyId');
  })();
  return false;
}
