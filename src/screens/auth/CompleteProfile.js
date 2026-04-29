// Shown after Google / Apple sign-in when the user has no BetterNature
// profile yet. Captures the fields the email signup flow collects so every
// account ends up with the same baseline data: first/last name, phone, and
// location. Selecting a chapter is optional — they can do it later.
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { fetchChapters } from '../../services/database';
import { updateProfile, getProfile } from '../../services/authFirebase';
import useAuthStore from '../../store/authStore';

export default function CompleteProfile() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  // Try to pre-split the Google displayName into first / last.
  const initialName = (user?.name || '').trim().split(/\s+/);
  const [firstName, setFirstName] = useState(initialName[0] || '');
  const [lastName, setLastName] = useState(initialName.slice(1).join(' ') || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [city, setCity] = useState(user?.city || '');
  const [state, setState] = useState(user?.state || '');
  const [zip, setZip] = useState(user?.zip || '');
  const [chapterId, setChapterId] = useState(user?.chapter_id || null);
  const [chapters, setChapters] = useState([]);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchChapters().then(setChapters).catch(() => setChapters([]));
  }, []);

  function validate() {
    const e = {};
    if (!firstName.trim()) e.firstName = 'First name is required';
    if (!lastName.trim()) e.lastName = 'Last name is required';
    if (!phone.trim()) e.phone = 'Phone is required';
    else if (phone.replace(/\D/g, '').length < 10) e.phone = 'Enter a valid phone';
    if (!city.trim()) e.city = 'City is required';
    if (!state.trim()) e.state = 'State is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    try {
      await updateProfile(user.id, {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        name: `${firstName.trim()} ${lastName.trim()}`,
        phone: phone.trim(),
        city: city.trim(),
        state: state.trim(),
        zip: zip.trim(),
        chapter_id: chapterId || null,
        profile_complete: true,
      });
      const fresh = await getProfile(user.id);
      if (fresh) setUser(fresh);
    } catch (err) {
      Alert.alert('Could not save', err.message || 'Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <BrushText variant="screenTitle" style={styles.title}>
          Welcome!
        </BrushText>
        <Text style={styles.subtitle}>
          Just a few details to finish setting up your account.
        </Text>

        <View style={styles.row}>
          <Input
            label="First name"
            placeholder="First"
            value={firstName}
            onChangeText={setFirstName}
            error={errors.firstName}
            autoCapitalize="words"
            containerStyle={styles.halfInput}
          />
          <Input
            label="Last name"
            placeholder="Last"
            value={lastName}
            onChangeText={setLastName}
            error={errors.lastName}
            autoCapitalize="words"
            containerStyle={styles.halfInput}
          />
        </View>

        <Input
          label="Phone"
          placeholder="(555) 123-4567"
          value={phone}
          onChangeText={setPhone}
          error={errors.phone}
          keyboardType="phone-pad"
        />

        <View style={styles.row}>
          <Input
            label="City"
            placeholder="City"
            value={city}
            onChangeText={setCity}
            error={errors.city}
            containerStyle={styles.cityInput}
          />
          <Input
            label="State"
            placeholder="TN"
            value={state}
            onChangeText={setState}
            error={errors.state}
            autoCapitalize="characters"
            maxLength={2}
            containerStyle={styles.stateInput}
          />
          <Input
            label="ZIP"
            placeholder="ZIP"
            value={zip}
            onChangeText={setZip}
            keyboardType="number-pad"
            containerStyle={styles.zipInput}
          />
        </View>

        {chapters.length > 0 && (
          <>
            <Text style={styles.chapterLabel}>Pick your chapter (optional)</Text>
            {chapters.map((c) => (
              <TouchableOpacity
                key={c.id}
                activeOpacity={0.7}
                onPress={() => setChapterId(chapterId === c.id ? null : c.id)}
                style={[
                  styles.chapterCard,
                  chapterId === c.id && styles.chapterSelected,
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.chapterName}>{c.name}</Text>
                  <Text style={styles.chapterLoc}>
                    {c.city}{c.state ? `, ${c.state}` : ''}
                  </Text>
                </View>
                <View style={[styles.radio, chapterId === c.id && styles.radioOn]}>
                  {chapterId === c.id && <View style={styles.radioDot} />}
                </View>
              </TouchableOpacity>
            ))}
          </>
        )}

        <Button
          title="Finish setup"
          onPress={handleSave}
          loading={saving}
          style={styles.btn}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: Colors.cream },
  content: { padding: 24, paddingTop: 60, paddingBottom: 60 },
  title: { color: Colors.green },
  subtitle: { ...Type.body, color: Colors.gray, marginTop: 4, marginBottom: 24 },
  row: { flexDirection: 'row', gap: 12 },
  halfInput: { flex: 1 },
  cityInput: { flex: 2 },
  stateInput: { flex: 1 },
  zipInput: { flex: 1.2 },
  chapterLabel: {
    ...Type.caption,
    fontWeight: '600',
    color: Colors.dark,
    marginTop: 8,
    marginBottom: 8,
  },
  chapterCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
    ...Shadows.card,
  },
  chapterSelected: { borderColor: Colors.pink },
  chapterName: { fontSize: 15, fontWeight: '700', color: Colors.dark },
  chapterLoc: { ...Type.caption, marginTop: 2 },
  radio: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: Colors.grayLight,
    alignItems: 'center', justifyContent: 'center',
  },
  radioOn: { borderColor: Colors.pink },
  radioDot: {
    width: 12, height: 12, borderRadius: 6, backgroundColor: Colors.pink,
  },
  btn: { marginTop: 16 },
});
