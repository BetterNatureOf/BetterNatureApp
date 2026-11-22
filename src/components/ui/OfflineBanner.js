// Tells people when the app is offline, so an action that hasn't reached
// the server never looks confirmed. Web uses the browser's online events.
// Native needs a connectivity module (e.g. @react-native-community/netinfo),
// which isn't installed yet — the banner simply doesn't render there.
import React, { useEffect, useState } from 'react';
import { Platform, Text, View, StyleSheet } from 'react-native';

export default function OfflineBanner() {
  const supported = Platform.OS === 'web' && typeof window !== 'undefined' && typeof navigator !== 'undefined';
  const [online, setOnline] = useState(supported ? navigator.onLine !== false : true);
  useEffect(() => {
    if (!supported) return undefined;
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, [supported]);
  if (online) return null;
  return (
    <View style={styles.bar} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Text style={styles.text}>You’re offline. Anything you tap now isn’t saved until you reconnect — check for a confirmation after.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { backgroundColor: '#5C4A1E', paddingVertical: 8, paddingHorizontal: 16 },
  text: { color: '#FFF8E6', fontSize: 13, fontWeight: '600', textAlign: 'center' },
});
