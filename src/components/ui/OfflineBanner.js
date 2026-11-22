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
    // The web root stretches top-level children to full height, so the bar
    // sits inside a pass-through layer that never blocks taps.
    <View pointerEvents="box-none" style={styles.layer}>
      <View pointerEvents="box-none" style={styles.layer}>
        <View style={styles.bar} accessibilityRole="alert" accessibilityLiveRegion="polite">
          <Text style={styles.text}>You’re offline. Anything you tap now isn’t saved until you reconnect — check for a confirmation after.</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Overlays the top edge instead of taking part in the root flex layout
  // (as a flex child it stretched to half the screen on web).
  layer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000 },
  bar: { backgroundColor: '#5C4A1E', paddingVertical: 8, paddingHorizontal: 16 },
  text: { color: '#FFF8E6', fontSize: 13, fontWeight: '600', textAlign: 'center' },
});
