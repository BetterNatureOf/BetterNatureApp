// Reusable contract-signing screen.
//
//   navigate('SignContract', { kind: 'executive' | 'restaurant' | 'volunteer' | 'president' })
//
// Renders the contract spec from services/contracts.js verbatim,
// captures inline form fields, then on submit:
//   1) saveContract() — writes users/{uid}.contract_{kind} = {...}
//   2) emailContractSummary() — POSTs a structured summary +
//      raw field values + typed signature to FormSubmit, which
//      relays it to info@betternatureofficial.org. Subject line
//      includes the signer's name (or business name + type) +
//      role per the latest spec.
import React, { useMemo, useState } from 'react';
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
import {
  CONTRACTS, saveContract, emailContractSummary, roleForKind,
} from '../../services/contracts';
import { getProfile } from '../../services/auth';
import { notify, notifyThen } from '../../services/ui';

// Hoisted out of the component so it isn't redefined on every render.
// (When defined inline, every keystroke creates a brand-new component
// type and React unmounts/remounts the whole subtree, blurring inputs.)
const WebWrapper = ({ children }) => React.createElement(
  'div',
  {
    style: {
      height: '100vh',
      width: '100%',
      overflowY: 'auto',
      overflowX: 'hidden',
      WebkitOverflowScrolling: 'touch',
      backgroundColor: Colors.cream,
    },
  },
  React.createElement('div', { style: { paddingBottom: 40 } }, children)
);
const NativeWrapper = ({ children }) => (
  <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  </KeyboardAvoidingView>
);
const Wrapper = Platform.OS === 'web' ? WebWrapper : NativeWrapper;

export default function SignContract({ route, navigation }) {
  const kind = route?.params?.kind || 'volunteer';
  const spec = CONTRACTS[kind];
  if (!spec) {
    return (
      <View style={styles.container}>
        <Text style={{ padding: 24 }}>Unknown contract type: {kind}</Text>
      </View>
    );
  }

  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  // Pre-fill anything we already know about the signer so they're not
  // retyping their name + email on every contract.
  const [values, setValues] = useState(() => {
    const init = {};
    (spec.fields || []).forEach((f) => {
      init[f.key] = (
        f.key === 'legal_name'   ? (user?.name  || '') :
        f.key === 'contact_name' ? (user?.name  || '') :
        f.key === 'phone'        ? (user?.phone || '') :
        f.key === 'contact_phone'? (user?.phone || '') :
        f.key === 'email'        ? (user?.email || '') :
        f.key === 'contact_email'? (user?.email || '') :
        ''
      );
    });
    return init;
  });

  const [agreed, setAgreed] = useState(false);
  // SMS consent is a required precondition for joining BetterNature —
  // we use texts for pickup alerts, event reminders, and safety
  // dispatch. Stored alongside the contract so we have provable
  // opt-in for TCPA compliance.
  const [smsConsent, setSmsConsent] = useState(false);
  const [signedName, setSignedName] = useState(user?.name || '');
  const [saving, setSaving] = useState(false);

  const missing = useMemo(() => {
    return (spec.fields || []).filter((f) => f.required && !values[f.key]?.trim());
  }, [spec.fields, values]);

  async function handleSign() {
    if (missing.length) {
      return notify('Fill the form', `Missing: ${missing.map((f) => f.label).join(', ')}.`);
    }
    if (!agreed) return notify('Check the box', 'You need to mark agreement to continue.');
    if (!smsConsent) return notify('Text alerts required', 'BetterNature uses SMS for pickup alerts, event reminders, and safety dispatch. You need to opt in to text messages to participate. You can pause individual categories later in Settings.');
    if (!signedName.trim()) return notify('Type your name', 'Your typed name acts as your signature.');
    if (!user?.id) return notify('Not signed in');
    setSaving(true);
    try {
      await saveContract(user.id, kind, {
        signedName,
        version: spec.version,
        extras: { ...values, sms_consent: true, sms_consent_at: new Date().toISOString() },
      });
      // Mirror SMS consent at the top level of the profile so the
      // dispatcher worker can read it without loading the full
      // contract block.
      try {
        const { updateProfile } = await import('../../services/auth');
        await updateProfile(user.id, {
          sms_consent: true,
          sms_consent_at: new Date().toISOString(),
        });
      } catch {}
      // Email is best-effort — never blocks the in-app save. We try
      // even if Firebase write failed because the user typed something
      // and we want a backup record.
      emailContractSummary({ kind, values, signedName, user })
        .catch((e) => console.warn('contract email failed', e));

      const fresh = await getProfile(user.id);
      if (fresh && setUser) setUser(fresh);
      notifyThen('Signed', 'Your contract is on file. A copy has been emailed to BetterNature.', () => {
        if (navigation?.canGoBack?.()) navigation.goBack();
      });
    } catch (e) {
      notify('Could not save', e?.message || 'Try again.');
    } finally { setSaving(false); }
  }

  return (
    <Wrapper>
      <>
        <ResponsiveContainer maxWidth={760}>
          <View style={styles.badge}>
            <Icon name="file" size={14} color={Colors.green} />
            <Text style={styles.badgeText}>{roleForKind(kind, user)} · v{spec.version}</Text>
          </View>
          <BrushText variant="screenTitle" style={styles.title}>{spec.title}</BrushText>
          <Text style={styles.subtitle}>{spec.subtitle}</Text>

          {/* Fields (collected at top so the user knows what they'll
              be filling in before reading the legal text) */}
          {(spec.fields || []).length ? (
            <View style={styles.card}>
              <Text style={styles.cardLabel}>Your details</Text>
              <Text style={styles.cardHelp}>
                These get attached to the agreement and emailed to BetterNature with your signature.
              </Text>
              {spec.fields.map((f) => (
                <View key={f.key} style={{ marginTop: 14 }}>
                  <Text style={styles.fieldLabel}>
                    {f.label}{f.required ? '' : <Text style={styles.optional}> (optional)</Text>}
                  </Text>
                  <Input
                    value={values[f.key]}
                    onChangeText={(v) => setValues((p) => ({ ...p, [f.key]: v }))}
                    placeholder={f.placeholder || ''}
                    autoCapitalize={f.key.includes('email') ? 'none' : 'sentences'}
                    keyboardType={
                      f.key.includes('email') ? 'email-address'
                      : f.key.includes('phone') ? 'phone-pad'
                      : 'default'
                    }
                  />
                </View>
              ))}
            </View>
          ) : null}

          {/* Recitals */}
          <View style={styles.legalCard}>
            <Text style={styles.legalHeading}>RECITALS</Text>
            {spec.recitals.map((p, i) => (
              <Text key={'r' + i} style={styles.para}>{p}</Text>
            ))}

            {spec.sections.map((sec) => (
              <View key={sec.heading} style={{ marginTop: 14 }}>
                <Text style={styles.legalHeading}>{sec.heading}</Text>
                {sec.body.map((p, i) => (
                  <Text
                    key={sec.heading + i}
                    style={[styles.para, p.startsWith('•') && styles.bullet]}
                  >
                    {p}
                  </Text>
                ))}
              </View>
            ))}
          </View>

          {/* Intent + agreement checkbox */}
          <Text style={styles.intent}>{spec.intentLine}</Text>

          <AnimatedPressable
            onPress={() => setAgreed(!agreed)}
            style={[styles.agreeRow, agreed && styles.agreeRowOn]}
            scaleTo={0.99}
          >
            <View style={[styles.checkbox, agreed && styles.checkboxOn]}>
              {agreed ? <Icon name="check" size={14} color={Colors.white} /> : null}
            </View>
            <Text style={[styles.agreeText, agreed && { color: Colors.green, fontWeight: '700' }]}>
              I have read and agree to the terms above.
            </Text>
          </AnimatedPressable>

          <AnimatedPressable
            onPress={() => setSmsConsent(!smsConsent)}
            style={[styles.agreeRow, smsConsent && styles.agreeRowOn]}
            scaleTo={0.99}
          >
            <View style={[styles.checkbox, smsConsent && styles.checkboxOn]}>
              {smsConsent ? <Icon name="check" size={14} color={Colors.white} /> : null}
            </View>
            <Text style={[styles.agreeText, smsConsent && { color: Colors.green, fontWeight: '700' }]}>
              I agree to receive SMS text messages from BetterNature for pickup alerts, event reminders, and safety dispatch. Standard message and data rates may apply. Reply STOP to opt out at any time, or pause categories in Settings.
            </Text>
          </AnimatedPressable>

          <Text style={styles.signLabel}>{spec.signatureLabel || 'Type your full legal name'}</Text>
          <Input
            value={signedName}
            onChangeText={setSignedName}
            placeholder="First Middle Last"
            autoCapitalize="words"
          />
          <Text style={styles.signHint}>
            This serves as your electronic signature under the E-SIGN Act (15 U.S.C. § 7001). A copy of this agreement and your details will be emailed to info@betternatureofficial.org.
          </Text>

          <Button
            title={saving ? 'Signing…' : 'Sign & submit'}
            onPress={handleSign}
            loading={saving}
            style={{ marginTop: 22 }}
          />

          <Text style={styles.footer}>
            BetterNature  ·  EIN 99-4028399  ·  624 Cypress Knoll Dr, Collierville, TN 38017
          </Text>
        </ResponsiveContainer>
      </>
    </Wrapper>
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
  subtitle: { ...Type.caption, color: Colors.gray, marginTop: 4, marginBottom: 18 },

  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: 16,
    borderWidth: 1, borderColor: Colors.glassBorder,
    ...Shadows.soft,
    marginBottom: 18,
  },
  cardLabel: { fontSize: 13, fontWeight: '800', color: Colors.dark, letterSpacing: 0.3, textTransform: 'uppercase' },
  cardHelp: { ...Type.caption, marginTop: 4 },
  fieldLabel: { fontSize: 12, fontWeight: '800', color: Colors.dark, marginBottom: 6, letterSpacing: 0.3, textTransform: 'uppercase' },
  optional: { fontWeight: '500', color: Colors.gray, textTransform: 'none' },

  legalCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: 18,
    borderWidth: 1, borderColor: Colors.glassBorder,
    ...Shadows.soft,
    marginBottom: 18,
  },
  legalHeading: {
    fontSize: 13, fontWeight: '800', color: Colors.green,
    letterSpacing: 0.5, textTransform: 'uppercase',
    marginBottom: 8, marginTop: 4,
  },
  para: { ...Type.body, color: Colors.dark, marginBottom: 10, lineHeight: 22 },
  bullet: { paddingLeft: 12 },

  intent: { ...Type.body, color: Colors.dark, lineHeight: 22, marginBottom: 12, fontStyle: 'italic' },

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

  signLabel: { fontSize: 12, fontWeight: '800', color: Colors.dark, marginTop: 18, marginBottom: 8, letterSpacing: 0.3, textTransform: 'uppercase' },
  signHint: { ...Type.caption, marginTop: 6 },

  footer: { ...Type.caption, color: Colors.gray, textAlign: 'center', marginTop: 24 },
});
