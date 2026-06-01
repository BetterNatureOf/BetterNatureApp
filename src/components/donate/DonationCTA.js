// Unified donation call-to-action.
//
// Order of preference, picked at runtime per device:
//   1. Apple Pay  (Safari/iOS via Stripe Payment Request)
//   2. Google Pay (Chrome/Android via Stripe Payment Request)
//   3. Zeffy      (fallback — works everywhere, 0% fees, no PSP needed)
//
// Until EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY is set, the Stripe layer
// silently returns null and only the Zeffy card renders. So this
// component is safe to drop in everywhere donations happen, regardless
// of whether Stripe is live yet.
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import Icon from '../ui/Icon';
import AnimatedPressable from '../ui/AnimatedPressable';
import { openDonationForm } from '../../services/zeffy';
import { buildPaymentRequest, isStripeConfigured } from '../../services/stripe';
import { notify } from '../../services/ui';

export default function DonationCTA({
  amount = 50,
  label = 'Sponsor your chapter',
  description = '0% platform fee — 100% of your gift funds the work',
}) {
  const [pspMode, setPspMode] = useState(null); // 'apple' | 'google' | null

  useEffect(() => {
    if (!isStripeConfigured()) return;
    (async () => {
      const ctx = await buildPaymentRequest({ amountCents: amount * 100, label });
      if (!ctx) return;
      // canMakePayment object tells us which brand to show. Stripe's
      // shape is { applePay: bool, googlePay: bool, link: bool, ... }
      if (ctx.canMakePayment?.applePay) setPspMode('apple');
      else if (ctx.canMakePayment?.googlePay) setPspMode('google');
      // Stash the pr instance for the button mount below. We attach to
      // a window-scoped slot so the imperative Stripe Element handoff
      // can find it without prop-drilling into a portal.
      if (typeof window !== 'undefined') window.__BN_PR__ = ctx.pr;
    })();
  }, [amount, label]);

  function handleZeffy() {
    openDonationForm({ amount });
  }

  function handlePSP() {
    // Wire to the mounted Payment Request button. We trigger pr.show()
    // imperatively so we don't need stripe's <PaymentRequestButtonElement>
    // (which only ships with @stripe/react-stripe-js).
    const pr = typeof window !== 'undefined' ? window.__BN_PR__ : null;
    if (!pr) {
      notify('Payment unavailable', 'Falling back to Zeffy.');
      handleZeffy();
      return;
    }
    try { pr.show(); }
    catch {
      // Old Stripe builds expose .canMakePayment differently; fall
      // back so the user can still donate.
      handleZeffy();
    }
  }

  return (
    <View style={styles.wrap}>
      {pspMode === 'apple' ? (
        <AnimatedPressable style={[styles.card, styles.applePay]} onPress={handlePSP} scaleTo={0.98}>
          <View style={styles.iconBlock}>
            <Text style={styles.applePayGlyph}>Pay</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: '#fff' }]}>Donate with Apple Pay</Text>
            <Text style={[styles.desc, { color: '#C8DDD4' }]}>One tap. {description}</Text>
          </View>
          <Icon name="chevron" size={20} color="#fff" />
        </AnimatedPressable>
      ) : null}

      {pspMode === 'google' ? (
        <AnimatedPressable style={[styles.card, styles.googlePay]} onPress={handlePSP} scaleTo={0.98}>
          <View style={styles.iconBlock}>
            <Text style={styles.googlePayGlyph}>G Pay</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: '#fff' }]}>Donate with Google Pay</Text>
            <Text style={[styles.desc, { color: '#D7E4F0' }]}>One tap. {description}</Text>
          </View>
          <Icon name="chevron" size={20} color="#fff" />
        </AnimatedPressable>
      ) : null}

      {/* Zeffy always present — primary CTA when PSP isn't available,
          secondary "or" option when it is. */}
      <AnimatedPressable style={[styles.card, styles.zeffy]} onPress={handleZeffy} scaleTo={0.98}>
        <View style={[styles.iconBlock, { backgroundColor: 'rgba(255,255,255,0.18)' }]}>
          <Icon name="heart" size={22} color={Colors.cream} strokeWidth={2.25} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: Colors.cream }]}>
            {pspMode ? 'Or donate via Zeffy' : label}
          </Text>
          <Text style={[styles.desc, { color: 'rgba(247,244,240,0.85)' }]}>
            {description}
          </Text>
        </View>
        <Icon name="external" size={18} color={Colors.cream} />
      </AnimatedPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10, marginBottom: 24 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 16,
    borderRadius: Radius.lg,
    ...Shadows.card,
  },
  iconBlock: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },
  desc: { fontSize: 12, marginTop: 2 },

  applePay: { backgroundColor: '#000' },
  applePayGlyph: { fontSize: 18, fontWeight: '700', color: '#fff', fontStyle: 'italic', letterSpacing: -0.5 },

  googlePay: { backgroundColor: '#1a73e8' },
  googlePayGlyph: { fontSize: 13, fontWeight: '700', color: '#fff' },

  zeffy: { backgroundColor: Colors.pink },
});
