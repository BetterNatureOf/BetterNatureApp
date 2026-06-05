import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { Colors, Type } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Screen from '../../components/ui/Screen';

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

  async function handleCreate() {
    const cityClean = city.trim();
    if (!cityClean || !state.trim()) {
      Alert.alert('Required', 'Please fill in city and state/region.');
      return;
    }

    setLoading(true);
    try {
      await addDoc(collection(db, 'chapter_applications'), {
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
      Alert.alert(
        'Application submitted',
        `Your application to start BetterNature ${cityClean} is under review. We'll email you within 48 hours.`,
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (e) {
      Alert.alert('Could not submit', e.message || 'Try again in a moment.');
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

        <Button title="Submit Chapter Application" onPress={handleCreate} loading={loading} style={styles.btn} />
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
});
