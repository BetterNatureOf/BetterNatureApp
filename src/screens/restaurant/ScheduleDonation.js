// Photo-first 60-second pickup post — Careit-style. The restaurant taps
// "Snap surplus", picks a weight chip, picks a window chip, taps Post.
// Goal: under a minute end-to-end so it actually happens during a busy
// service. Anything not on this screen is friction.
import React, { useState } from 'react';
import {
  View, Text, ScrollView, Image, StyleSheet, Alert, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import useAuthStore from '../../store/authStore';
import { createPickup } from '../../services/database';
import { uploadPickupPhoto } from '../../services/pickupPhotos';

const WEIGHT_CHIPS = [5, 10, 20, 50, 100];

const WINDOW_CHIPS = [
  { key: '1h',  label: 'Within 1 hr',     hours: 1 },
  { key: '3h',  label: 'End of shift',    hours: 3 },
  { key: '12h', label: 'Tomorrow morning', hours: 12 },
  { key: '24h', label: 'Within 24 hrs',   hours: 24 },
];

function inHours(h) {
  return new Date(Date.now() + h * 60 * 60 * 1000).toISOString();
}

export default function ScheduleDonation({ navigation }) {
  const user = useAuthStore((s) => s.user);
  const [photoUri, setPhotoUri] = useState(null);
  const [weight, setWeight] = useState(20);
  const [windowKey, setWindowKey] = useState('3h');
  const [notes, setNotes] = useState('');
  const [posting, setPosting] = useState(false);

  async function snapPhoto() {
    // Camera-first; fall back to library if user denies camera.
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        return openLibrary();
      }
      const result = await ImagePicker.launchCameraAsync({
        quality: 0.7,
        allowsEditing: false,
      });
      if (!result.canceled) setPhotoUri(result.assets[0].uri);
    } catch {
      openLibrary();
    }
  }
  async function openLibrary() {
    const result = await ImagePicker.launchImageLibraryAsync({
      quality: 0.7, mediaTypes: ImagePicker.MediaTypeOptions.Images,
    });
    if (!result.canceled) setPhotoUri(result.assets[0].uri);
  }

  async function handlePost() {
    if (!photoUri) {
      Alert.alert('Need a photo', 'A quick photo helps volunteers know what to expect.');
      return;
    }
    setPosting(true);
    try {
      const restaurantId = user?.restaurant_id || user?.id;
      const photoUrl = await uploadPickupPhoto(restaurantId, photoUri).catch(() => null);
      const w = WINDOW_CHIPS.find(x => x.key === windowKey) || WINDOW_CHIPS[1];
      await createPickup({
        restaurant_id: restaurantId,
        restaurant_name: user?.name || user?.business_name || 'Restaurant',
        chapter_id: user?.chapter_id || null,
        chapter_name: user?.chapter_name || '',
        photo_url: photoUrl || null,
        estimated_weight_lbs: weight,
        meals_estimate: Math.round(weight * 1.2),
        pickup_window_hours: w.hours,
        pickup_window_until: inHours(w.hours),
        notes: notes.trim(),
      });
      Alert.alert(
        'Posted!',
        `Volunteers in your area have been notified. ~${Math.round(weight * 1.2)} meals worth — pickup window ${w.label.toLowerCase()}.`,
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
    } catch (e) {
      Alert.alert('Could not post', e.message || 'Try again.');
    } finally {
      setPosting(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>{'\u2039 Back'}</Text>
        </TouchableOpacity>
        <BrushText variant="screenTitle" style={styles.title}>Post surplus</BrushText>
        <Text style={styles.subtitle}>
          Photo + weight + window. About 60 seconds, end of shift.
        </Text>

        {/* Photo */}
        <TouchableOpacity
          style={styles.photoWell}
          activeOpacity={0.85}
          onPress={snapPhoto}
        >
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.photo} />
          ) : (
            <View style={styles.photoEmpty}>
              <Text style={styles.photoEmoji}>📸</Text>
              <Text style={styles.photoCta}>Tap to snap surplus</Text>
              <Text style={styles.photoHelp}>One photo. Doesn't have to be pretty.</Text>
            </View>
          )}
        </TouchableOpacity>
        {photoUri && (
          <TouchableOpacity onPress={snapPhoto} style={styles.retake}>
            <Text style={styles.retakeText}>Retake</Text>
          </TouchableOpacity>
        )}

        {/* Weight chips */}
        <Text style={styles.sectionLabel}>About how many pounds?</Text>
        <View style={styles.chipsRow}>
          {WEIGHT_CHIPS.map(w => (
            <TouchableOpacity
              key={w}
              style={[styles.chip, weight === w && styles.chipOn]}
              onPress={() => setWeight(w)}
              activeOpacity={0.8}
            >
              <Text style={[styles.chipText, weight === w && styles.chipTextOn]}>{w} lb</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.preview}>
          ≈ {Math.round(weight * 1.2)} meals · {Math.round(weight * 3.8)} lbs CO₂ avoided
        </Text>

        {/* Window chips */}
        <Text style={styles.sectionLabel}>Pickup window</Text>
        <View style={styles.chipsCol}>
          {WINDOW_CHIPS.map(w => (
            <TouchableOpacity
              key={w.key}
              style={[styles.windowChip, windowKey === w.key && styles.chipOn]}
              onPress={() => setWindowKey(w.key)}
              activeOpacity={0.8}
            >
              <Text style={[styles.chipText, windowKey === w.key && styles.chipTextOn]}>
                {w.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Notes (optional) */}
        <Text style={styles.sectionLabel}>Notes <Text style={styles.optional}>(optional)</Text></Text>
        <Input
          placeholder="e.g., Use back door, ask for Mike"
          value={notes}
          onChangeText={setNotes}
          multiline
          style={{ height: 70 }}
        />

        <Button
          title={posting ? 'Posting…' : 'Post pickup'}
          onPress={handlePost}
          loading={posting}
          style={styles.submit}
        />
        {posting && (
          <View style={styles.uploadingHint}>
            <ActivityIndicator size="small" color={Colors.green} />
            <Text style={styles.uploadingText}>Uploading photo…</Text>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: Colors.cream },
  content: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  back: { fontSize: 16, color: Colors.green, marginBottom: 8 },
  title: { color: Colors.green },
  subtitle: { ...Type.body, color: Colors.gray, marginTop: 4, marginBottom: 24 },

  photoWell: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: Radius.xl,
    backgroundColor: Colors.greenLight,
    borderWidth: 2,
    borderColor: Colors.green + '40',
    borderStyle: 'dashed',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  photo: { width: '100%', height: '100%' },
  photoEmpty: { alignItems: 'center', padding: 24 },
  photoEmoji: { fontSize: 56, marginBottom: 12 },
  photoCta: { fontSize: 17, fontWeight: '700', color: Colors.green },
  photoHelp: { ...Type.caption, color: Colors.gray, marginTop: 4 },
  retake: { alignSelf: 'center', padding: 8 },
  retakeText: { fontSize: 13, fontWeight: '600', color: Colors.pink },

  sectionLabel: {
    fontSize: 14, fontWeight: '700', color: Colors.dark,
    marginTop: 22, marginBottom: 10, letterSpacing: 0.2,
  },
  optional: { fontWeight: '500', color: Colors.gray },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chipsCol: { gap: 8 },
  chip: {
    paddingVertical: 12, paddingHorizontal: 18,
    borderRadius: Radius.lg,
    backgroundColor: Colors.white,
    borderWidth: 1.5, borderColor: Colors.glassBorder,
  },
  windowChip: {
    paddingVertical: 14, paddingHorizontal: 18,
    borderRadius: Radius.lg,
    backgroundColor: Colors.white,
    borderWidth: 1.5, borderColor: Colors.glassBorder,
    alignItems: 'center',
  },
  chipOn: { backgroundColor: Colors.green, borderColor: Colors.green },
  chipText: { fontSize: 15, fontWeight: '600', color: Colors.dark },
  chipTextOn: { color: Colors.white },
  preview: { ...Type.caption, marginTop: 10, color: Colors.gray },

  submit: { marginTop: 24 },
  uploadingHint: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    justifyContent: 'center', marginTop: 8,
  },
  uploadingText: { ...Type.caption },
});
