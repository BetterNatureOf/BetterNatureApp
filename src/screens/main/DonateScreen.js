// Donate.
//
// The Zeffy iframe owns the whole donation flow now — amount, monthly
// vs. one-time, card / ACH / Apple Pay-on-card. We don't render our own
// amount chips or monthly toggle anymore; they were redundant (Zeffy
// re-asks for the same thing the moment the iframe loads) and adding
// chrome before the embed made the page feel slower than it is.
//
// A Stripe-backed Apple Pay / Google Pay one-tap row still renders
// above the embed when FEATURES.STRIPE_PSP is on — it's a faster path
// for repeat donors. Until Stripe is configured, the row self-hides.
import React from 'react';
import { ScrollView, StyleSheet, Text, Platform } from 'react-native';
import { Colors, Type } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import ResponsiveContainer from '../../components/ui/ResponsiveContainer';
import { FEATURES } from '../../config/features';
import ZeffyEmbed from '../../components/donate/ZeffyEmbed';

// PSP donation row is conditionally imported below — only when the
// Stripe feature flag is on. Some older bundles crashed inside the
// lazy Stripe loader on first paint when Stripe wasn't configured, so
// we just don't render that subtree until it's actually wired.
let DonationCTA = null;
if (FEATURES.STRIPE_PSP) {
  // eslint-disable-next-line global-require
  DonationCTA = require('../../components/donate/DonationCTA').default;
}

export default function DonateScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ResponsiveContainer maxWidth={720}>
        <BrushText variant="screenTitle" style={styles.title}>
          Make a donation
        </BrushText>
        <Text style={styles.subtitle}>
          100% of your gift goes to BetterNature programs. Tax-deductible.
        </Text>

        {DonationCTA ? (
          <DonationCTA
            label="Donate one-tap"
            description="Apple Pay or Google Pay — fastest path for repeat donors"
            showZeffy={false}
          />
        ) : null}

        <ZeffyEmbed height={Platform.OS === 'web' ? 980 : 0} />
      </ResponsiveContainer>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
    ...(Platform.OS === 'web' ? { height: '100vh' } : null),
  },
  content: { padding: 24, paddingTop: 60, paddingBottom: 60 },
  title: { color: Colors.green },
  subtitle: { ...Type.body, color: Colors.gray, marginTop: 6, marginBottom: 24 },
});
