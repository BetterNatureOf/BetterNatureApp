// Driver setup.
//
// Required for any volunteer who wants to claim an IRIS (food rescue)
// pickup. Two paths:
//
//   1. "I drive myself"
//      → upload the volunteer's own driver's license
//
//   2. "Someone else drives me"
//      → upload that person's driver's license
//      → capture their name + relationship + (optional) phone
//      → that person signs a consent statement (typed signature)
//
// Either path writes the same shape to users/{uid}.driver:
//   {
//     type:                   'self' | 'other',
//     license_url:            <Storage URL>,
//     holder_name:            'Satvik Koya'                  (other only)
//     holder_relationship:    'parent'|'guardian'|'sibling'|... (other only)
//     holder_phone:           '+19015550199'                  (optional)
//     consent_signed:         true                            (other only)
//     consent_signed_name:    'Anita Koya'                    (other only)
//     consent_signed_at:      <server timestamp>              (other only)
//     reviewed_status:        'pending' | 'approved' | 'rejected'
//   }
import React, { useState } from 'react';
import {
  View, Text, ScrollView, Image, StyleSheet, Platform, KeyboardAvoidingView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import ResponsiveContainer from '../../components/ui/ResponsiveContainer';
import AnimatedPressable from '../../components/ui/AnimatedPressable';
import Icon from '../../components/ui/Icon';
import useAuthStore from '../../store/authStore';
import { uploadIdImage, getProfile } from '../../services/auth';
import { saveDriverSetup } from '../../services/verifications';
import { notify, notifyThen } from '../../services/ui';
import Screen from '../../components/ui/Screen';

const RELATIONSHIPS = [
  { key: 'parent',   label: 'Parent' },
  { key: 'guardian', label: 'Legal guardian' },
  { key: 'sibling',  label: 'Sibling (18+)' },
  { key: 'spouse',   label: 'Spouse / partner' },
  { key: 'friend',   label: 'Friend (18+)' },
  { key: 'other',    label: 'Other' },
];

export default function DriverSetup({ navigation }) {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  const [type, setType] = useState('self');                 // 'self' | 'other'
  const [licenseFrontUri, setLicenseFrontUri] = useState(null);
  const [licenseBackUri,  setLicenseBackUri]  = useState(null);
  const [holderName, setHolderName] = useState('');
  const [relationship, setRelationship] = useState('parent');
  const [holderPhone, setHolderPhone] = useState('');
  const [consentName, setConsentName] = useState('');       // typed signature
  const [consentChecked, setConsentChecked] = useState(false);
  const [saving, setSaving] = useState(false);

  async function pickFor(setter) {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        const lib = await ImagePicker.launchImageLibraryAsync({ quality: 0.8, mediaTypes: ImagePicker.MediaTypeOptions.Images });
        if (!lib.canceled) setter(lib.assets[0].uri);
        return;
      }
      const cam = await ImagePicker.launchCameraAsync({ quality: 0.8 });
      if (!cam.canceled) setter(cam.assets[0].uri);
    } catch (e) {
      notify('Could not open camera', e?.message || 'Try the photo library instead.');
    }
  }

  async function handleSubmit() {
    if (!licenseFrontUri) return notify('Front of the license', 'Photo of the FRONT of the driver’s license is required.');
    if (!licenseBackUri)  return notify('Back of the license',  'Photo of the BACK of the driver’s license is required too.');

    if (type === 'other') {
      if (!holderName.trim()) return notify('Driver’s name required', 'Enter the full legal name of the person driving.');
      if (!relationship)      return notify('Pick a relationship', 'How do you know your driver?');
      if (!consentChecked || !consentName.trim()) {
        return notify('Driver must sign consent', 'The driver types their name to consent to drive you on BetterNature pickups.');
      }
      if (consentName.trim().toLowerCase() !== holderName.trim().toLowerCase()) {
        return notify(
          'Names don’t match',
          'The signature has to match the driver’s legal name (exact spelling).',
        );
      }
    }

    if (!user?.id) return notify('Not signed in');
    setSaving(true);
    try {
      // 1. Upload both license images. We file them under a driver
      // namespace so they don't get confused with the volunteer's
      // personal-ID images in Firebase Storage.
      const [licenseFrontUrl, licenseBackUrl] = await Promise.all([
        uploadIdImage(user.id, licenseFrontUri, { kind: 'driver', side: 'front' }),
        uploadIdImage(user.id, licenseBackUri,  { kind: 'driver', side: 'back' }),
      ]);

      // 2. Save the structured driver block on the user doc. We pass
      // licenseUrl pointing at the front for back-compat with admin
      // surfaces that only render a single thumbnail.
      await saveDriverSetup(user.id, {
        type,
        licenseUrl: licenseFrontUrl,
        licenseFrontUrl,
        licenseBackUrl,
        holderName:         type === 'other' ? holderName.trim() : (user.name || ''),
        holderRelationship: type === 'other' ? relationship : 'self',
        holderPhone:        type === 'other' ? holderPhone.trim() : (user.phone || ''),
        consentSignedName:  type === 'other' ? consentName.trim() : null,
      });

      // 3. Refresh the in-memory profile so the gate stops prompting.
      const fresh = await getProfile(user.id);
      if (fresh && setUser) setUser(fresh);

      notifyThen('Saved', 'Driver info on file. An admin will review and approve.', () => {
        if (navigation?.canGoBack?.()) navigation.goBack();
      });
    } catch (e) {
      notify('Could not save', e?.message || 'Try again.');
    } finally { setSaving(false); }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen contentStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ResponsiveContainer maxWidth={680}>
          <View style={styles.badge}>
            <Icon name="id-card" size={16} color={Colors.green} />
            <Text style={styles.badgeText}>Driver setup</Text>
          </View>
          <BrushText variant="screenTitle" style={styles.title}>Who’s driving?</BrushText>
          <Text style={styles.subtitle}>
            IRIS pickups require a valid driver’s license linked to your account. Pick whichever applies.
          </Text>

          {/* Self / Other toggle */}
          <View style={styles.toggleRow}>
            <AnimatedPressable
              style={[styles.toggleCard, type === 'self' && styles.toggleCardOn]}
              onPress={() => setType('self')}
              scaleTo={0.985}
            >
              <Icon name="user" size={20} color={type === 'self' ? Colors.green : Colors.grayMid} />
              <Text style={[styles.toggleLabel, type === 'self' && styles.toggleLabelOn]}>I drive myself</Text>
              <Text style={styles.toggleHelp}>I’ll upload my own license.</Text>
            </AnimatedPressable>
            <AnimatedPressable
              style={[styles.toggleCard, type === 'other' && styles.toggleCardOn]}
              onPress={() => setType('other')}
              scaleTo={0.985}
            >
              <Icon name="users" size={20} color={type === 'other' ? Colors.green : Colors.grayMid} />
              <Text style={[styles.toggleLabel, type === 'other' && styles.toggleLabelOn]}>Someone drives me</Text>
              <Text style={styles.toggleHelp}>Parent, sibling, friend (18+).</Text>
            </AnimatedPressable>
          </View>

          {/* License upload — front + back */}
          <Text style={styles.sectionLabel}>
            {type === 'self' ? 'Your driver’s license' : 'Driver’s license photo'}
          </Text>
          <LicenseWell
            label="Front"
            help="Name, photo, and expiration should all be readable."
            uri={licenseFrontUri}
            onPress={() => pickFor(setLicenseFrontUri)}
          />
          <LicenseWell
            label="Back"
            help="Hold the card flat under good light. Barcode + class info should be clear."
            uri={licenseBackUri}
            onPress={() => pickFor(setLicenseBackUri)}
          />

          {/* "Other" → collect driver info + consent */}
          {type === 'other' ? (
            <>
              <Text style={styles.sectionLabel}>Driver’s name</Text>
              <Input
                value={holderName}
                onChangeText={setHolderName}
                placeholder="First Middle Last"
                autoCapitalize="words"
              />

              <Text style={styles.sectionLabel}>Relationship</Text>
              <View style={styles.relRow}>
                {RELATIONSHIPS.map((r) => (
                  <AnimatedPressable
                    key={r.key}
                    style={[styles.relPill, relationship === r.key && styles.relPillOn]}
                    onPress={() => setRelationship(r.key)}
                    scaleTo={0.96}
                  >
                    <Text style={[styles.relText, relationship === r.key && styles.relTextOn]}>{r.label}</Text>
                  </AnimatedPressable>
                ))}
              </View>

              <Text style={styles.sectionLabel}>
                Driver’s phone <Text style={styles.optional}>(optional, for emergencies)</Text>
              </Text>
              <Input
                value={holderPhone}
                onChangeText={setHolderPhone}
                placeholder="(555) 123-4567"
                keyboardType="phone-pad"
              />

              {/* Consent block — must be signed by the driver */}
              <View style={styles.consentCard}>
                <Text style={styles.consentTitle}>Driver consent</Text>
                <Text style={styles.consentBody}>
                  I, the driver named above, agree to safely transport this BetterNature volunteer
                  to and from food rescue pickups. I confirm I hold a valid, current driver’s license
                  and active vehicle insurance, and I assume all driving-related risk. I have read
                  BetterNature’s volunteer liability waiver.
                </Text>

                <AnimatedPressable
                  onPress={() => setConsentChecked(!consentChecked)}
                  style={[styles.agreeRow, consentChecked && styles.agreeRowOn]}
                  scaleTo={0.99}
                >
                  <View style={[styles.checkbox, consentChecked && styles.checkboxOn]}>
                    {consentChecked ? <Icon name="check" size={14} color={Colors.white} /> : null}
                  </View>
                  <Text style={[styles.agreeText, consentChecked && { color: Colors.green, fontWeight: '700' }]}>
                    Driver agrees to the statement above.
                  </Text>
                </AnimatedPressable>

                <Text style={styles.signLabel}>Driver types their full legal name</Text>
                <Input
                  value={consentName}
                  onChangeText={setConsentName}
                  placeholder="Same spelling as on the license"
                  autoCapitalize="words"
                />
                <Text style={styles.signHint}>
                  Must match the name on the license — this is the driver’s electronic signature.
                </Text>
              </View>
            </>
          ) : null}

          <Button
            title={saving ? 'Saving…' : 'Submit for approval'}
            onPress={handleSubmit}
            loading={saving}
            style={{ marginTop: 24 }}
          />
        </ResponsiveContainer>
      </Screen>
    </KeyboardAvoidingView>
  );
}

// Re-usable well — captures one side of the license. Same dashed
// "Tap to take photo" empty state on both halves.
function LicenseWell({ label, help, uri, onPress }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={licenseWellStyles.label}>{label}</Text>
      <AnimatedPressable style={licenseWellStyles.well} onPress={onPress} scaleTo={0.985}>
        {uri ? (
          <Image source={{ uri }} style={licenseWellStyles.preview} resizeMode="cover" />
        ) : (
          <View style={licenseWellStyles.empty}>
            <Icon name="id-card" size={36} color={Colors.green} strokeWidth={1.5} />
            <Text style={licenseWellStyles.cta}>Tap to take {label.toLowerCase()}</Text>
            <Text style={licenseWellStyles.help}>{help}</Text>
          </View>
        )}
      </AnimatedPressable>
      {uri ? (
        <AnimatedPressable onPress={onPress} style={licenseWellStyles.retake}>
          <Text style={licenseWellStyles.retakeText}>Retake {label.toLowerCase()}</Text>
        </AnimatedPressable>
      ) : null}
    </View>
  );
}

const licenseWellStyles = StyleSheet.create({
  label: { fontSize: 12, fontWeight: '800', color: Colors.dark, letterSpacing: 0.3, textTransform: 'uppercase', marginBottom: 6 },
  well: {
    width: '100%',
    aspectRatio: 16 / 10,
    borderRadius: Radius.lg,
    backgroundColor: Colors.white,
    borderWidth: 2, borderColor: Colors.green + '40',
    borderStyle: 'dashed',
    overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
    ...Shadows.soft,
  },
  preview: { width: '100%', height: '100%' },
  empty: { alignItems: 'center', padding: 16 },
  cta: { fontSize: 14, fontWeight: '800', color: Colors.green, marginTop: 6 },
  help: { ...Type.caption, marginTop: 4, textAlign: 'center', paddingHorizontal: 10 },
  retake: { alignSelf: 'center', padding: 6, marginTop: 2 },
  retakeText: { fontSize: 12, fontWeight: '600', color: Colors.pink },
});

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

  toggleRow: { flexDirection: 'row', gap: 10, marginBottom: 22 },
  toggleCard: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: 14,
    borderWidth: 1.5, borderColor: Colors.glassBorder,
    ...Shadows.soft,
  },
  toggleCardOn: { borderColor: Colors.green, backgroundColor: Colors.greenLight },
  toggleLabel: { fontSize: 14, fontWeight: '700', color: Colors.dark, marginTop: 8 },
  toggleLabelOn: { color: Colors.green },
  toggleHelp: { ...Type.caption, marginTop: 2 },

  sectionLabel: {
    fontSize: 13, fontWeight: '800', color: Colors.dark,
    letterSpacing: 0.3, textTransform: 'uppercase',
    marginTop: 18, marginBottom: 8,
  },
  optional: { fontWeight: '500', color: Colors.gray, textTransform: 'none' },

  licenseWell: {
    width: '100%',
    aspectRatio: 16 / 10,
    borderRadius: Radius.lg,
    backgroundColor: Colors.white,
    borderWidth: 2, borderColor: Colors.green + '40',
    borderStyle: 'dashed',
    overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
    ...Shadows.soft,
  },
  licensePreview: { width: '100%', height: '100%' },
  licenseEmpty: { alignItems: 'center', padding: 20 },
  licenseCta: { fontSize: 15, fontWeight: '800', color: Colors.green, marginTop: 8 },
  licenseHelp: { ...Type.caption, marginTop: 4, textAlign: 'center' },
  retake: { alignSelf: 'center', padding: 8, marginTop: 6 },
  retakeText: { fontSize: 13, fontWeight: '600', color: Colors.pink },

  relRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  relPill: {
    paddingVertical: 8, paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: Colors.white,
    borderWidth: 1.5, borderColor: Colors.glassBorder,
  },
  relPillOn: { backgroundColor: Colors.green, borderColor: Colors.green },
  relText: { fontSize: 13, fontWeight: '600', color: Colors.dark },
  relTextOn: { color: Colors.white },

  consentCard: {
    marginTop: 18,
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: 16,
    borderWidth: 1, borderColor: Colors.glassBorder,
    ...Shadows.soft,
  },
  consentTitle: { fontSize: 14, fontWeight: '800', color: Colors.dark, marginBottom: 6, letterSpacing: -0.2 },
  consentBody: { ...Type.body, marginBottom: 14, lineHeight: 22 },

  agreeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 12,
    borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: Colors.glassBorder,
  },
  agreeRowOn: { borderColor: Colors.green, backgroundColor: Colors.greenLight },
  checkbox: {
    width: 20, height: 20, borderRadius: 6,
    borderWidth: 1.5, borderColor: Colors.grayMid,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: Colors.green, borderColor: Colors.green },
  agreeText: { flex: 1, fontSize: 13, color: Colors.dark },

  signLabel: { fontSize: 12, fontWeight: '800', color: Colors.dark, marginTop: 14, marginBottom: 6, letterSpacing: 0.3, textTransform: 'uppercase' },
  signHint: { ...Type.caption, marginTop: 6 },
});
