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
import { createPickup, ensureMyPartnerRecord } from '../../services/database';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { uploadPickupPhoto } from '../../services/pickupPhotos';
import { requireVerifiedId } from '../../services/idGate';
import { notify, notifyThen } from '../../services/ui';
import DatePicker from '../../components/ui/DatePicker';
import ResponsiveContainer from '../../components/ui/ResponsiveContainer';
import Icon from '../../components/ui/Icon';
import FridgePicker from '../../components/ui/FridgePicker';
import Screen from '../../components/ui/Screen';

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
  // The two timing options are mutually exclusive — either a quick
  // "within X hrs" window OR a specific future date/time. Picking
  // one clears the other so a posted pickup never has ambiguous
  // intent. Default is window mode.
  const [timingMode, setTimingMode] = useState('window'); // 'window' | 'date'
  const [scheduledFor, setScheduledFor] = useState(null);
  const [notes, setNotes] = useState('');
  const [posting, setPosting] = useState(false);
  // Volunteer-friendly drop-off destination. The restaurant can pre-pick
  // a fridge, and if they don't, the volunteer chooses when claiming.
  const [fridgeId, setFridgeId] = useState(null);
  const [fridgeName, setFridgeName] = useState('');

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
    if (!requireVerifiedId(user, navigation)) return;
    if (!photoUri) {
      notify('Need a photo', 'A quick photo helps volunteers know what to expect.');
      return;
    }
    // Hard-gate posting on a complete profile so we never push a
    // pickup to the volunteer feed without an address attached.
    // Accept ANY of: business_name, organization name, or
    // personal name — churches and community gardens frequently
    // don't have a "business_name" set but they do have a
    // recognizable partner name.
    const hasName = !!(user?.business_name || user?.organization_name || user?.name);
    const hasAddress = !!user?.address && hasName;
    if (!user?.restaurant_complete && !hasAddress) {
      notifyThen(
        'Finish your profile first',
        'Add your address and business/organization name so the volunteer knows where to come.',
        () => navigation.navigate('RestaurantOnboarding'),
      );
      return;
    }
    if (timingMode === 'date') {
      if (!scheduledFor) {
        notify('Pick a date & time', 'Specific-date mode is selected but no time was chosen.');
        return;
      }
      if (scheduledFor.getTime() < Date.now() - 60000) {
        notify('Pick a future time', 'The scheduled date you chose has already passed.');
        return;
      }
    }
    setPosting(true);
    try {
      // Ensure the /restaurants doc exists. A church with
      // roles=['partner'] but no restaurant_id yet would otherwise
      // fall back to user.id, which fetches nothing (no address
      // enrichment) and reads confusingly downstream. This heals
      // the record on-the-fly.
      let restaurantId = user?.restaurant_id;
      if (!restaurantId) {
        restaurantId = await ensureMyPartnerRecord(user);
      }
      if (!restaurantId) {
        notify(
          'Partner record missing',
          'Your account is flagged as a partner but the record didn\'t materialize. Reload the page and try again — email info@betternatureofficial.org if it keeps happening.'
        );
        setPosting(false);
        return;
      }
      const w = WINDOW_CHIPS.find(x => x.key === windowKey) || WINDOW_CHIPS[1];
      // Either mode — never both. The other field is forced to null
      // so downstream code (restaurant feed sort, SMS dispatcher,
      // pickup card 'pickup by' line) reads one canonical source.
      const useDate = timingMode === 'date';
      const until = useDate ? scheduledFor.toISOString() : inHours(w.hours);
      const hoursOut = useDate
        ? Math.max(1, Math.round((scheduledFor.getTime() - Date.now()) / 3600000))
        : w.hours;

      // Guard: a restaurant without a chapter_id will post a pickup
      // that fans out to nobody (notification fan-out + volunteer
      // feed both filter by chapter_id). Block + tell them how to
      // fix instead of silently dropping the post into the void.
      if (!user?.chapter_id) {
        notify(
          'No chapter linked',
          'Your restaurant isn\'t linked to a BetterNature chapter yet. Email info@betternatureofficial.org to assign one — otherwise no volunteer will see your post.'
        );
        return;
      }

      // Post the pickup IMMEDIATELY without waiting for the photo
      // upload. Volunteers see it on the feed; the photo gets
      // patched onto the doc when the upload finishes (usually a
      // couple seconds later). This is the difference between
      // "Post" responding in 0.5s vs 8s on a slow connection.
      const created = await createPickup({
        restaurant_id: restaurantId,
        restaurant_name: user?.business_name || user?.name || 'Restaurant',
        chapter_id: user?.chapter_id || null,
        chapter_name: user?.chapter_name || '',
        photo_url: null,
        photo_uploading: !!photoUri,
        estimated_weight_lbs: weight,
        meals_estimate: Math.round(weight * 1.2),
        pickup_window_hours: hoursOut,
        pickup_window_until: until,
        scheduled_for: useDate ? scheduledFor.toISOString() : null,
        timing_mode: useDate ? 'date' : 'window',
        fridge_id: fridgeId || null,
        fridge_name: fridgeName || '',
        notes: notes.trim(),
      });

      // Toast and dismiss right away.
      notifyThen(
        'Posted!',
        `Volunteers nearby just got notified. ~${Math.round(weight * 1.2)} meals worth — pickup ${useDate ? 'on the scheduled date' : 'window ' + w.label.toLowerCase()}.`,
        () => navigation.goBack(),
      );

      // Fire-and-forget photo upload + patch. If it fails the
      // pickup still exists, just without a thumbnail; restaurant
      // can re-upload from the pickup detail screen. Critically,
      // on failure we still flip photo_uploading:false so the
      // volunteer-side card doesn't sit on a spinner forever —
      // it just shows "no photo" and the run continues.
      if (photoUri && created?.id) {
        uploadPickupPhoto(restaurantId, photoUri)
          .then((photoUrl) => {
            return updateDoc(doc(db, 'pickups', created.id), {
              photo_url: photoUrl || null,
              photo_uploading: false,
              photo_upload_failed: !photoUrl,
            });
          })
          .catch((e) => {
            console.warn('photo upload (post-create)', e);
            return updateDoc(doc(db, 'pickups', created.id), {
              photo_uploading: false,
              photo_upload_failed: true,
            }).catch(() => {});
          });
      }
    } catch (e) {
      console.error('createPickup failed:', e);
      notify('Could not post', e?.message || 'Try again.');
    } finally {
      setPosting(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen contentStyle={styles.content} keyboardShouldPersistTaps="handled">
       <ResponsiveContainer maxWidth={760}>
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
              <Icon name="camera" size={48} color={Colors.green} strokeWidth={1.75} />
              <Text style={[styles.photoCta, { marginTop: 12 }]}>Tap to snap surplus</Text>
              <Text style={styles.photoHelp}>One photo. Doesn't have to be pretty.</Text>
            </View>
          )}
        </TouchableOpacity>
        {photoUri && (
          <TouchableOpacity onPress={snapPhoto} style={styles.retake}>
            <Text style={styles.retakeText}>Retake</Text>
          </TouchableOpacity>
        )}

        {/* Weight — quick chips + free-form input. Chips snap to common
            values; the input lets a kitchen with a real scale type the
            exact number. Either one keeps the meal/CO₂ preview live. */}
        <Text style={styles.sectionLabel}>About how many pounds?</Text>
        <View style={styles.weightRow}>
          <Input
            value={String(weight || '')}
            onChangeText={(v) => {
              // Allow blank while typing, otherwise clamp to a number.
              const cleaned = v.replace(/[^\d.]/g, '');
              const n = cleaned === '' ? 0 : parseFloat(cleaned);
              if (!isNaN(n)) setWeight(n);
            }}
            keyboardType="decimal-pad"
            placeholder="20"
            style={styles.weightInput}
          />
          <Text style={styles.weightUnit}>lb</Text>
        </View>
        <View style={styles.chipsRow}>
          {WEIGHT_CHIPS.map(w => (
            <TouchableOpacity
              key={w}
              style={[styles.chip, weight === w && styles.chipOn]}
              onPress={() => setWeight(w)}
              activeOpacity={0.8}
            >
              <Text style={[styles.chipText, weight === w && styles.chipTextOn]}>{w}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.preview}>
          ≈ {Math.round(weight * 1.2)} meals · {Math.round(weight * 3.8)} lbs CO₂ avoided
        </Text>

        {/* Pickup timing — mutually exclusive modes */}
        <Text style={styles.sectionLabel}>When can volunteers pick this up?</Text>
        <View style={styles.modeToggle}>
          <TouchableOpacity
            style={[styles.modeOpt, timingMode === 'window' && styles.modeOptOn]}
            onPress={() => { setTimingMode('window'); setScheduledFor(null); }}
            activeOpacity={0.85}
          >
            <Text style={[styles.modeOptText, timingMode === 'window' && styles.modeOptTextOn]}>
              Pickup window
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeOpt, timingMode === 'date' && styles.modeOptOn]}
            onPress={() => setTimingMode('date')}
            activeOpacity={0.85}
          >
            <Text style={[styles.modeOptText, timingMode === 'date' && styles.modeOptTextOn]}>
              Specific date
            </Text>
          </TouchableOpacity>
        </View>

        {timingMode === 'window' ? (
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
        ) : (
          <>
            <DatePicker
              value={scheduledFor}
              onChange={setScheduledFor}
              mode="datetime"
              minDate={new Date()}
              placeholder="Tap to choose date & time"
            />
            {scheduledFor && (
              <TouchableOpacity onPress={() => setScheduledFor(null)} style={styles.retake}>
                <Text style={styles.retakeText}>Clear date</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        {/* Drop-off destination — community fridge network */}
        <Text style={styles.sectionLabel}>
          Drop off at <Text style={styles.optional}>(optional — volunteer can also choose)</Text>
        </Text>
        <FridgePicker
          value={fridgeId}
          onChange={(id, f) => { setFridgeId(id); setFridgeName(f?.name || ''); }}
          chapterId={user?.chapter_id}
          emptyHint="No community fridges in your chapter yet. The volunteer who claims this pickup will choose where to drop off."
        />

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
       </ResponsiveContainer>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  // Explicit web height — same reasoning as RestDashboard. flex: 1
  // alone collapses to auto inside the nested navigator divs.
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
    ...(Platform.OS === 'web' ? { height: '100vh' } : null),
  },
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
  weightRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  weightInput: { flex: 1, fontSize: 22, fontWeight: '700' },
  weightUnit: { fontSize: 18, fontWeight: '700', color: Colors.gray },
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
  modeToggle: {
    flexDirection: 'row', gap: 6, padding: 4,
    backgroundColor: '#F7F5EF', borderRadius: 999, marginBottom: 12,
  },
  modeOpt: { flex: 1, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 999, alignItems: 'center' },
  modeOptOn: { backgroundColor: Colors.white, shadowColor: '#000', shadowOpacity: 0.06, shadowOffset: { width: 0, height: 1 }, shadowRadius: 3, elevation: 2 },
  modeOptText: { fontSize: 13, fontWeight: '700', color: Colors.gray, letterSpacing: 0.3 },
  modeOptTextOn: { color: Colors.green },
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
