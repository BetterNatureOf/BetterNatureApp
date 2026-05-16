// Shared ID-verification gate. Returns true if the user has uploaded an ID,
// otherwise pops an alert offering to send them to VerifyId and returns false.
// Both ScheduleDonation (restaurant post) and the volunteer claim flow call
// this before letting the action proceed.
import { Alert } from 'react-native';

export function requireVerifiedId(user, navigation) {
  if (user?.id_document_url) return true;
  Alert.alert(
    'Verify your ID first',
    'For everyone\u2019s safety, you need to upload a photo of a government-issued ID before scheduling or claiming food pickups.',
    [
      { text: 'Not now', style: 'cancel' },
      { text: 'Verify ID', onPress: () => navigation?.navigate?.('VerifyId') },
    ],
  );
  return false;
}
