// Reusable contract signing screen.
//
// Navigation:  navigate('SignContract', { kind: 'restaurant' | 'executive' | 'president' })
//
// Reads the contract spec (clauses + extra fields + intent line + version)
// from services/contracts.js. Captures every extra field, runs the
// agreement-checkbox + typed-signature, then calls saveContract() with
// the structured payload.
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
import { CONTRACTS, saveContract } from '../../services/contracts';
import { getProfile } from '../../services/auth';
import { notify, notifyThen } from '../../services/ui';

export default function SignContract({ route, navigation }) {
  const kind = route?.params?.kind || 'executive';
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

  // Field values for spec.extraFields, keyed by field.key.
  const [values, setValues] = useState(() => {
    const init = {};
    (spec.extraFields || []).forEach((f) => { init[f.key] = ''; });
    return init;
  });
  const [agreed, setAgreed] = useState(false);
  const [signedName, setSignedName] = useState(user?.name || '');
  const [saving, setSaving] = useState(false);

  const missing = useMemo(() => {
    return (spec.extraFields || []).filter((f) => f.required && !values[f.key]?.trim());
  }, [spec.extraFields, values]);

  async function handleSign() {
    if (missing.length) {
      return notify('Fill the form', `Missing: ${missing.map((f) => f.label).join(', ')}.`);
    }
    if (!agreed) {
      return notify('Check the box', 'You need to mark agreement to continue.');
    }
    if (!signedName.trim()) {
      return notify('Type your name', 'Your typed name acts as your signature.');
    }
    if (!user?.id) return notify('Not signed in');
    setSaving(true);
    try {
      await saveContract(user.id, kind, {
        signedName,
        version: spec.version,
        extras: values,
      });
      const fresh = await getProfile(user.id);
      if (fresh && setUser) setUser(fresh);
      notifyThen('Signed', 'On file. You’re cleared for this role.', () => {
        if (navigation?.canGoBack?.()) navigation.goBack();
      });
    } catch (e) {
      notify('Could not save', e?.message || 'Try again.');
    } finally { setSaving(false); }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ResponsiveContainer maxWidth={720}>
          <View style={styles.badge}>
            <Icon name="file" size={16} color={Colors.green} />
            <Text style={styles.badgeText}>{spec.eyebrow} · v{spec.version}</Text>
          </View>
          <BrushText variant="screenTitle" style={styles.title}>{spec.title}</BrushText>

          {/* Extra structured fields (legal name, EIN, contact, etc.) */}
          {(spec.extraFields || []).length > 0 ? (
            <View style={styles.fieldsCard}>
              {spec.extraFields.map((f) => (
                <View key={f.key} style={{ marginBottom: 12 }}>
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

          {/* Legal text */}
          <View style={styles.legalCard}>
            {spec.clauses.map((p, i) => (
              <Text key={i} style={[styles.para, i === spec.clauses.length - 1 && { marginBottom: 0 }]}>
                {p}
              </Text>
            ))}
          </View>

          {/* Intent line + checkbox */}
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

          {/* Typed signature */}
          <Text style={styles.signLabel}>Type your full legal name</Text>
          <Input
            value={signedName}
            onChangeText={setSignedName}
            placeholder="First Middle Last"
            autoCapitalize="words"
          />
          <Text style={styles.signHint}>
            This serves as your electronic signature under the E-SIGN Act (15 U.S.C. § 7001).
          </Text>

          <Button
            title={saving ? 'Saving…' : `Sign ${spec.title.split(' ').slice(0, 1)[0]} agreement`}
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

  title: { color: Colors.green, marginBottom: 18 },

  fieldsCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: 16,
    borderWidth: 1, borderColor: Colors.glassBorder,
    ...Shadows.soft,
    marginBottom: 18,
  },
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
  para: { ...Type.body, color: Colors.dark, marginBottom: 14, lineHeight: 22 },

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
});
