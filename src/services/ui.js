// Cross-platform alert/confirm helpers.
// react-native-web's Alert.alert silently drops multi-button alerts and
// never fires the onPress callbacks, so on web we fall back to
// window.alert/window.confirm. Native uses RN's Alert as normal.
import { Alert, Platform } from 'react-native';

const isWeb = Platform.OS === 'web' && typeof window !== 'undefined';

export function notify(title, message) {
  if (isWeb) {
    window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}

// Async confirm — resolves true on OK, false on Cancel.
export function confirm(title, message) {
  if (isWeb) return Promise.resolve(window.confirm(message ? `${title}\n\n${message}` : title));
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'OK', onPress: () => resolve(true) },
    ]);
  });
}

// Toast-style success: just shows a message and runs an optional follow-up
// once the user dismisses. Works on web *and* native, unlike the previous
// Alert.alert([{ text: 'OK', onPress: ... }]) pattern which broke on web.
export function notifyThen(title, message, after) {
  if (isWeb) {
    window.alert(message ? `${title}\n\n${message}` : title);
    after?.();
    return;
  }
  Alert.alert(title, message, [{ text: 'OK', onPress: () => after?.() }]);
}
