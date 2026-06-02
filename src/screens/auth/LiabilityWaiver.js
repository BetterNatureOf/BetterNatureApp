// Liability waiver — the form every volunteer signs during onboarding.
//
// Sits between ID upload and the dashboard. Required for any account
// that wants to claim a pickup (the ID gate also checks
// users/{uid}.waiver_signed). Stored as:
//   waiver_signed:        true
//   waiver_signed_name:   <typed legal name>
//   waiver_signed_at:     <server timestamp>
//   waiver_version:       <integer; bump if the legal text changes>
//
// Bump WAIVER_VERSION whenever the legal text changes — anyone with an
// older version will be prompted to re-sign before they can claim again.
import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Platform, KeyboardAvoidingView,
} from 'react-native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import ResponsiveContainer from '../../components/ui/ResponsiveContainer';
import AnimatedPressable from '../../components/ui/AnimatedPressable';
import Icon from '../../components/ui/Icon';
import useAuthStore from '../../store/authStore';
import { saveSignedWaiver } from '../../services/verifications';
import { getProfile } from '../../services/auth';
import { notify, notifyThen } from '../../services/ui';

export const WAIVER_VERSION = 1;

const WAIVER_TEXT = [
  'I am a volunteer with BetterNature. I acknowledge that food rescue and ' +
  'related volunteer activities carry inherent risks — including but not limited ' +
  'to handling food products, driving to and from pickup locations, lifting and ' +
  'transporting items, and interacting with restaurants, community fridges, and ' +
  'community members.',

  'I voluntarily assume all risks associated with my participation, and I release ' +
  'BetterNature, its officers, volunteers, chapters, and partners from any and all ' +
  'claims, liabilities, or causes of action arising out of my participation, except ' +
  'in cases of gross negligence or willful misconduct.',

  'I confirm that I will handle rescued food in a safe and sanitary manner; that I will ' +
  'not consume the food I deliver; that I will not knowingly redistribute spoiled, ' +
  'expired, or contaminated food; and that I will follow the instructions of the ' +
  'restaurants and community fridge stewards I work with.',

  'I confirm I am at least 18 years old, OR — if I am between 14 and 17 — a parent ' +
  'or legal guardian has reviewed and consented to this agreement on my behalf.',

  'By typing my full legal name below, I confirm that I have read and agree to the ' +
  'terms above, and that this constitutes a valid electronic signature under the ' +
  'E-SIGN Act (15 U.S.C. § 7001) and applicable state law.',
];

export default function LiabilityWaiver({ navigation }) {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [agreed, setAgreed] = useState(false);
  const [signedName, setSignedName] = useState(user?.name || '');
  const [saving, setSaving] = useState(false);

  async function handleSign() {
    if (!agreed) return notify('Check the box', 'You need to mark agreement to continue.');
    if (!signedName.trim()) return notify('Type your name', 'Your typed name acts as your signature.');
    if (!user?.id) return notify('Not signed in', 'Sign in again to continue.');
    setSaving(true);
    try {
      await saveSignedWaiver(user.id, { signedName, version: WAIVER_VERSION });
      const fresh = await getProfile(user.id);
      if (fresh && setUser) setUser(fresh);
      notifyThen('Signed', 'Thanks! You’re cleared to claim pickups.', () => {
        // Pop the waiver off the stack; the app routes the user to the
        // right home based on role.
        if (navigation?.canGoBack?.()) navigation.goBack();
      });
    } catch (e) {
      notify('Could not save', e?.message || 'Try again.');
    } finally { setSaving(false); }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <ResponsiveContainer maxWidth={680}>
          <View style={styles.badge}>
            <Icon name="shield" size={18} color={Colors.green} />
            <Text style={styles.badgeText}>Liability waiver · v{WAIVER_VERSION}</Text>
          </View>
          <BrushText variant="screenTitle" style={styles.title}>Sign to volunteer</BrushText>
          <Text style={styles.subtitle}>
            Quick read. Real form, real signature. Required once per account.
          </Text>

          <View style={styles.legalCard}>
            {WAIVER_TEXT.map((p, i) => (
              <Text key={i} style={[styles.para, i === WAIVER_TEXT.length - 1 && { marginBottom: 0 }]}>
                {p}
              </Text>
            ))}
          </View>

          <AnimatedPressable
            onPress={() => setAgreed(!agreed)}
            style={[styles.agreeRow, agreed && styles.agreeRowOn]}
            scaleTo={0.99}
          >
            <View style={[styles.checkbox, agreed && styles.checkboxOn]}>
              {agreed ? <Icon name="check" size={14} color={Colors.white} /> : null}
            </View>
            <Text style={[styles.agreeText, agreed && { color: Colors.green, fontWeight: '700' }]}>
              I have read and agree to the waiver above.
            </Text>
          </AnimatedPressable>

          <Text style={styles.signLabel}>Type your full legal name</Text>
          <Input
            value={signedName}
            onChangeText={setSignedName}
            placeholder="First Middle Last"
            autoCapitalize="words"
          />
          <Text style={styles.signHint}>
            Your typed name is your signature. We stamp it with the current date and store both on your account.
          </Text>

          <Button
            title={saving ? 'Saving…' : 'Sign & finish setup'}
            onPress={handleSign}
            loading={saving}
            style={{ marginTop: 22 }}
          />
        </ResponsiveContainer>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
    ...(Platform.OS === 'web' ? { height: '100vh' } : null),
  },
  content: { padding: 24, paddingTop: 60, paddingBottom: 80 },

  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10, paddingVertical: 4,
    backgroundColor: Colors.greenLight,
    borderRadius: 999,
    marginBottom: 12,
  },
  badgeText: { fontSize: 11, fontWeight: '800', color: Colors.green, letterSpacing: 0.3 },

  title: { color: Colors.green },
  subtitle: { ...Type.body, color: Colors.gray, marginTop: 4, marginBottom: 18 },

  legalCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: 18,
    borderWidth: 1, borderColor: Colors.glassBorder,
    ...Shadows.soft,
    marginBottom: 18,
  },
  para: { ...Type.body, color: Colors.dark, marginBottom: 14, lineHeight: 22 },

  agreeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14,
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1.5, borderColor: Colors.glassBorder,
  },
  agreeRowOn: { borderColor: Colors.green, backgroundColor: Colors.greenLight },
  checkbox: {
    width: 22, height: 22, borderRadius: 6,
    borderWidth: 1.5, borderColor: Colors.grayMid,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: Colors.green, borderColor: Colors.green },
  agreeText: { flex: 1, fontSize: 14, color: Colors.dark },

  signLabel: { fontSize: 13, fontWeight: '800', color: Colors.dark, marginTop: 18, marginBottom: 8, letterSpacing: 0.3, textTransform: 'uppercase' },
  signHint: { ...Type.caption, marginTop: 6 },
});
