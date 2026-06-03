// Edit profile — lets the user update name/phone/city/state/zip and saves
// the result back into users/{uid}. Mirrors the fields CompleteProfile asks
// for so OAuth users can fill in / fix anything later.
import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { Colors, Type } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import PlaceInput from '../../components/ui/PlaceInput';
import ResponsiveContainer from '../../components/ui/ResponsiveContainer';
import useAuthStore from '../../store/authStore';
import { updateProfile, getProfile } from '../../services/auth';
import { notifyThen, notify } from '../../services/ui';

export default function EditProfile({ navigation }) {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  const [name, setName] = useState(user?.name || '');
  const [firstName, setFirstName] = useState(user?.first_name || '');
  const [lastName, setLastName] = useState(user?.last_name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [city, setCity] = useState(user?.city || '');
  const [state, setState] = useState(user?.state || '');
  const [zip, setZip] = useState(user?.zip || '');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!user?.id) return;
    setSaving(true);
    try {
      const fullName = name.trim() || `${firstName} ${lastName}`.trim();
      await updateProfile(user.id, {
        name: fullName,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone: phone.trim(),
        city: city.trim(),
        state: state.trim(),
        zip: zip.trim(),
        profile_complete: true,
      });
      const fresh = await getProfile(user.id);
      if (fresh && setUser) setUser(fresh);
      notifyThen('Saved', 'Your profile has been updated.', () => navigation.goBack());
    } catch (e) {
      console.error('EditProfile save failed:', e);
      notify('Could not save', e?.message || 'Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
       <ResponsiveContainer maxWidth={720}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
        <BrushText variant="screenTitle" style={styles.title}>Edit Profile</BrushText>
        <Text style={styles.subtitle}>Keep your info up to date.</Text>

        <Text style={styles.label}>Display name</Text>
        <Input value={name} onChangeText={setName} placeholder="How others see you" />

        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>First name</Text>
            <Input value={firstName} onChangeText={setFirstName} placeholder="First" />
          </View>
          <View style={{ width: 12 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Last name</Text>
            <Input value={lastName} onChangeText={setLastName} placeholder="Last" />
          </View>
        </View>

        <Text style={styles.label}>Phone</Text>
        <Input value={phone} onChangeText={setPhone} placeholder="(555) 123-4567" keyboardType="phone-pad" />

        <Text style={styles.label}>City</Text>
        <PlaceInput
          value={city}
          onChange={(v) => {
            setCity(v);
            // If the user picks "City, ST" out of the suggestions, autofill state.
            const m = /,\s*([A-Z]{2})$/.exec(v || '');
            if (m) { setCity(v.split(',')[0]); setState(m[1]); }
          }}
          placeholder="Memphis"
        />

        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>State</Text>
            <Input value={state} onChangeText={setState} placeholder="TN" autoCapitalize="characters" maxLength={2} />
          </View>
          <View style={{ width: 12 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>ZIP</Text>
            <Input value={zip} onChangeText={setZip} placeholder="38103" keyboardType="number-pad" maxLength={5} />
          </View>
        </View>

        <Text style={styles.email}>Email: {user?.email}</Text>

        <Button title={saving ? 'Saving…' : 'Save changes'} onPress={handleSave} loading={saving} style={{ marginTop: 24 }} />
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
  content: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  back: { fontSize: 16, color: Colors.green, marginBottom: 8 },
  title: { color: Colors.green },
  subtitle: { ...Type.body, color: Colors.gray, marginTop: 4, marginBottom: 20 },
  label: { fontSize: 13, fontWeight: '700', color: Colors.dark, marginTop: 14, marginBottom: 6 },
  row: { flexDirection: 'row' },
  email: { ...Type.caption, marginTop: 18, color: Colors.gray },
});
