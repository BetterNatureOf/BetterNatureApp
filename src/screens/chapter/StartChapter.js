import React, { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { Colors, Type, Radius } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Screen from '../../components/ui/Screen';
import { notify } from '../../services/ui';

// Chapter applications submitted from the signup flow. We can't write
// directly to /chapters here — the user is mid-signup and isn't an
// admin — so this goes into /chapter_applications, where execs review
// and approve, which then materializes the real chapter doc.
//
// Naming convention is enforced server-side too: chapter.name is
// always "BetterNature <City>" — no free-form names, no access codes.

export default function StartChapter({ navigation, route }) {
  const userData = route?.params || {};
  const [city, setCity] = useState(userData?.city || '');
  const [state, setState] = useState(userData?.state || '');
  const [country, setCountry] = useState(userData?.country || '');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(null); // holds { name, ref_id } after success

  async function handleCreate() {
    const cityClean = city.trim();
    if (!cityClean || !state.trim()) {
      notify('Required', 'Please fill in city and state/region.');
      return;
    }

    setLoading(true);
    try {
      const ref = await addDoc(collection(db, 'chapter_applications'), {
        // Enforced naming — exec approval will create the real
        // chapters/{id} doc with exactly this name.
        proposed_name: `BetterNature ${cityClean}`,
        city: cityClean,
        state: state.trim(),
        country: country.trim() || null,
        applicant_name: userData?.full_name || userData?.name || null,
        applicant_email: userData?.email || null,
        applicant_phone: userData?.phone || null,
        applicant_signup_payload: userData || null,
        status: 'pending',
        created_at: serverTimestamp(),
      });
      // Best-effort: enqueue an email receipt to the applicant via the
      // notifications_outbox the Cloudflare dispatcher drains. If the
      // dispatcher isn't deployed yet, the doc still sits in Firestore
      // as a record and the in-screen confirmation below is the
      // user-facing receipt.
      try {
        if (userData?.email) {
          await addDoc(collection(db, 'notifications_outbox'), {
            to_email: userData.email,
            subject: `BetterNature ${cityClean} — application received`,
            body:
              `Hi ${userData.full_name || userData.name || 'there'},\n\n` +
              `We received your application to start BetterNature ${cityClean}. ` +
              `Our executive team reviews every application within 48 hours and will ` +
              `email you with the decision and next steps.\n\n` +
              `Application reference: ${ref.id}\n\n` +
              `— BetterNature\nbetternatureofficial.org`,
            kind: 'chapter_application_receipt',
            created_at: serverTimestamp(),
          });
        }
      } catch (e) { console.warn('outbox enqueue failed (non-blocking)', e); }
      setSubmitted({ name: `BetterNature ${cityClean}`, ref_id: ref.id });
      notify(
        'Application submitted',
        `Your application to start BetterNature ${cityClean} is in. Reference: ${ref.id.slice(0, 8)}.`
      );
    } catch (e) {
      notify('Could not submit', e.message || 'Try again in a moment.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen contentStyle={styles.content} keyboardShouldPersistTaps="handled">
        <BrushText variant="screenTitle" style={styles.title}>
          Start a Chapter
        </BrushText>
        <Text style={styles.subtitle}>
          Bring BetterNature to your community. Tell us where — we'll review and reach out within 48 hours.
        </Text>

        {submitted ? (
          <View style={styles.successCard}>
            <Text style={styles.successCheck}>✓</Text>
            <Text style={styles.successTitle}>
              Application submitted for {submitted.name}
            </Text>
            <Text style={styles.successBody}>
              Your application was saved successfully. The BetterNature executive
              team has been notified and will review it within 48 hours. We'll
              email you {userData?.email ? userData.email : 'the address on your account'} with the decision.
            </Text>
            <Text style={styles.successRef}>Reference ID: {submitted.ref_id}</Text>
            <Button
              title="Done"
              onPress={() => navigation.goBack()}
              style={{ marginTop: 14 }}
            />
          </View>
        ) : null}

        <View style={styles.preview}>
          <Text style={styles.previewLabel}>Your chapter will be named</Text>
          <Text style={styles.previewName}>
            BetterNature {city.trim() || '[City]'}
          </Text>
        </View>

        <View style={styles.row}>
          <Input label="City" placeholder="City" value={city} onChangeText={setCity} containerStyle={styles.half} />
          <Input label="State / Region" placeholder="State or region" value={state} onChangeText={setState} containerStyle={styles.half} />
        </View>
        <Input
          label="Country (optional)"
          placeholder="Country"
          value={country}
          onChangeText={setCountry}
        />

        <Text style={styles.note}>
          Your application will be reviewed by the BetterNature executive team.
          You'll be notified within 48 hours.
        </Text>

        {submitted ? null : (
          <Button title="Submit Chapter Application" onPress={handleCreate} loading={loading} style={styles.btn} />
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  title: { color: Colors.green },
  subtitle: { ...Type.body, color: Colors.gray, marginTop: 4, marginBottom: 24 },
  preview: {
    backgroundColor: Colors.creamDark || '#f4ede0',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  previewLabel: { ...Type.caption, color: Colors.gray },
  previewName: { fontSize: 20, fontWeight: '700', color: Colors.green, marginTop: 4 },
  row: { flexDirection: 'row', gap: 12 },
  half: { flex: 1 },
  note: { ...Type.caption, marginTop: 8, marginBottom: 16, lineHeight: 18 },
  btn: { marginTop: 8 },
  successCard: {
    backgroundColor: '#E8F5EA',
    borderRadius: 14,
    padding: 20,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: Colors.green,
  },
  successCheck: {
    fontSize: 32,
    color: Colors.green,
    fontWeight: '800',
    marginBottom: 4,
  },
  successTitle: { fontSize: 18, fontWeight: '700', color: Colors.green, marginBottom: 8 },
  successBody: { ...Type.body, color: Colors.dark, lineHeight: 20 },
  successRef: {
    ...Type.caption,
    marginTop: 10,
    color: Colors.gray,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
});
