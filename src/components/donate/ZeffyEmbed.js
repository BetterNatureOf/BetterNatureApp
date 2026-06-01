// Inline Zeffy donation form.
//
// On web: renders Zeffy's iframe directly so the donor stays inside the
// BetterNature surface — card, ACH, every method Zeffy supports is
// handled by the embed, no separate "credit card" button needed.
//
// On native: iframes inside a WebView are awkward and Zeffy's
// scroll/keyboard handling fights React Native — so we surface a single
// CTA that opens the form in the system browser. Same end-result.
import React from 'react';
import { View, StyleSheet, Platform, TouchableOpacity, Text } from 'react-native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import Icon from '../ui/Icon';
import { getZeffyFormUrl, openDonationForm } from '../../services/zeffy';

export default function ZeffyEmbed({ amount, recurring, height = 900 }) {
  if (Platform.OS === 'web') {
    // Compose the URL with the donor's pre-selected amount + frequency.
    let url = getZeffyFormUrl();
    const params = [];
    if (amount)    params.push(`amount=${amount}`);
    if (recurring) params.push('frequency=monthly');
    if (params.length) url += '?' + params.join('&');

    // Render via createElement so we don't fight RN-web's <View> primitive.
    return (
      <View style={styles.wrap}>
        {React.createElement('iframe', {
          src: url,
          title: 'Donate to BetterNature',
          style: {
            width: '100%',
            height,
            border: 'none',
            display: 'block',
            background: 'transparent',
          },
          allow: 'payment',
          loading: 'lazy',
        })}
      </View>
    );
  }

  // Native fallback — open the same form externally.
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      style={styles.nativeBtn}
      onPress={() => openDonationForm({ amount, recurring })}
    >
      <View style={styles.nativeIcon}>
        <Icon name="heart" size={22} color={Colors.cream} strokeWidth={2.25} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.nativeTitle}>Donate via Zeffy</Text>
        <Text style={styles.nativeDesc}>Opens the secure form in your browser — card, ACH, Apple Pay supported</Text>
      </View>
      <Icon name="external" size={20} color={Colors.cream} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    borderRadius: Radius.xl,
    overflow: 'hidden',
    backgroundColor: Colors.white,
    ...Shadows.card,
    marginBottom: 16,
  },
  nativeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.pink,
    borderRadius: Radius.lg,
    padding: 16,
    marginBottom: 16,
    ...Shadows.card,
  },
  nativeIcon: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },
  nativeTitle: { color: Colors.cream, fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },
  nativeDesc: { color: 'rgba(247,244,240,0.85)', fontSize: 12, marginTop: 2 },
});
