// Donate.
//
// Bare-bones: a fixed-height container that holds the Zeffy iframe.
// We avoid ScrollView + ResponsiveContainer + BrushText here entirely
// because /donate has been crashing with a deep "reading '0' of
// undefined" error during paint on the production bundle; this version
// has effectively zero work in its render path to make sure the
// failure isn't ours.
import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Colors } from '../../config/theme';
import { getZeffyFormUrl } from '../../services/zeffy';

export default function DonateScreen() {
  const url = getZeffyFormUrl();

  // Web: render an <iframe> directly. We don't pass through any of
  // our wrapper components on this screen — the page is the iframe.
  if (Platform.OS === 'web') {
    return (
      <View style={styles.web}>
        <Text style={styles.title}>Make a donation</Text>
        <Text style={styles.subtitle}>100% of your gift goes to BetterNature programs. Tax-deductible.</Text>
        {React.createElement('iframe', {
          src: url,
          title: 'Donate to BetterNature',
          style: {
            width: '100%',
            height: 'calc(100vh - 150px)',
            border: 'none',
            display: 'block',
            background: 'transparent',
            borderRadius: 16,
            overflow: 'hidden',
            boxShadow: '0 12px 36px rgba(27,58,45,0.10)',
          },
          allow: 'payment',
          loading: 'lazy',
        })}
      </View>
    );
  }

  // Native: external link is handled by ZeffyEmbed elsewhere; this
  // screen is only used on web in practice.
  return null;
}

const styles = StyleSheet.create({
  web: {
    flex: 1,
    backgroundColor: Colors.cream,
    padding: 24,
    paddingTop: 60,
    height: '100vh',
  },
  title:    { fontSize: 30, fontWeight: '700', color: Colors.green, marginBottom: 6 },
  subtitle: { fontSize: 14, color: Colors.gray, marginBottom: 16 },
});
