// Photo-first 60-second pickup post — Careit-style. The restaurant taps
// "Snap surplus", picks a weight chip, picks a window chip, taps Post.
// Goal: under a minute end-to-end so it actually happens during a busy
// service. Anything not on this screen is friction.
import React, { useRef, useState } from 'react';
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
import { createPickup, ensureMyPartnerRecord, listPartnerSites, requestReceivingPartner } from '../../services/database';
import { mealsFromLbs, co2FromLbs, humanImpactPhrase } from '../../services/impact';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { uploadPickupPhoto } from '../../services/pickupPhotos';
import { requireVerifiedId } from '../../services/idGate';
import ContractGate from '../../components/ui/ContractGate';
import { notify, notifyThen, confirm } from '../../services/ui';
import DatePicker from '../../components/ui/DatePicker';
import ResponsiveContainer from '../../components/ui/ResponsiveContainer';
import Icon from '../../components/ui/Icon';
import Screen from '../../components/ui/Screen';
import PaperPlaneButton from '../../components/ui/PaperPlaneButton';
import { FOOD_CATEGORIES } from '../../../functions/lib/rescueCargo';
import { BrandHero, BrandSheet } from '../../components/ui/BrandHero';

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
  const postedNote = useRef('');
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
  // Load details volunteers and receiving sites match against. Optional:
  // blank stays unknown rather than defaulting to something that may be wrong.
  const [foodCategory, setFoodCategory] = useState(null);
  const [packages, setPackages] = useState('');
  // Where the food should go. A preferred partner is asked first and may
  // decline; the donor decides whether it can then go to other partners.
  const [partnerSites, setPartnerSites] = useState(null);
  const [destinationMode, setDestinationMode] = useState('network');   // 'preferred' | 'network' | 'coordinator'
  const [preferredSite, setPreferredSite] = useState(null);
  const [offerToNetwork, setOfferToNetwork] = useState(true);
  React.useEffect(() => {
    let alive = true;
    listPartnerSites().then((sites) => alive && setPartnerSites(sites)).catch(() => alive && setPartnerSites([]));
    return () => { alive = false; };
  }, []);
  const [posting, setPosting] = useState(false);
  // Volunteer-friendly drop-off destination. The restaurant can pre-pick
  // a fridge, and if they don't, the volunteer chooses when claiming.

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
    // Photo used to be a hard gate — you couldn't post without
    // one. That blocked partners with a locked kitchen phone,
    // failed Storage uploads (before Storage was initialized), or
    // just wanting to type "5 lbs veggies" and go. Now it's a soft
    // confirm: no photo? warn once, but let them post.
    if (!photoUri) {
      const ok = await confirm(
        'No photo attached',
        'Volunteers get less info without a photo — is that OK? You can always add one after posting.'
      );
      if (!ok) return;
    }
    // Hard-gate posting on a complete profile so we never push a
    // pickup to the volunteer feed without an address attached.
    // Accept ANY of: business_name, organization name, or
    // personal name — churches and community gardens frequently
    // don't have a "business_name" set but they do have a
    // recognizable partner name.
    // Address is important (volunteers need to know where to go),
    // but we no longer HARD-block on it — a partner might post
    // from their kitchen with the address on file at the exec
    // level. Warn only if we have zero identifiable address.
    const hasName = !!(user?.business_name || user?.organization_name || user?.name);
    const hasAddress = !!user?.address && hasName;
    if (!user?.restaurant_complete && !hasAddress) {
      const ok = await confirm(
        'No address on file',
        'Volunteers won\'t know where to pick up. Continue anyway (they\'ll ask via phone) — or complete your profile in Settings first?'
      );
      if (!ok) {
        navigation.navigate('RestaurantOnboarding');
        return;
      }
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
          'Your organization isn\'t linked to a BetterNature chapter yet. Email info@betternatureofficial.org to assign one — otherwise no volunteer will see your post.'
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
        notes: notes.trim(),
        food_category: foodCategory,
        packages: /^\d+$/.test(packages.trim()) && parseInt(packages, 10) > 0 ? parseInt(packages, 10) : null,
      });

      // Ask the chosen partner (or the network). If that request fails the
      // donation still exists; a coordinator can place it.
      let partnerNote = 'A coordinator will confirm where it goes.';
      if (created?.id && destinationMode !== 'coordinator' && (destinationMode === 'network' || preferredSite)) {
        try {
          await requestReceivingPartner(created.id, { mode: destinationMode, siteId: preferredSite?.id || null, offerToNetwork });
          partnerNote = destinationMode === 'preferred'
            ? `${preferredSite.name} has been asked. ${offerToNetwork ? 'If they can’t take it, it goes to other BN partners.' : 'If they can’t take it, we’ll let you know.'}`
            : 'BN receiving partners in your chapter have been asked.';
        } catch (e) {
          partnerNote = 'We couldn’t reach the partner just now, so a coordinator will confirm where it goes.';
        }
      }
      // The send button flies off once this resolves, then shows the note.
      postedNote.current = `${partnerNote} Volunteers are only contacted after a receiving partner accepts.`;

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
      return true;
    } catch (e) {
      console.error('createPickup failed:', e);
      return { error: e?.message ? `Couldn’t post: ${e.message}` : 'Couldn’t post — try again' };
    } finally {
      setPosting(false);
    }
  }

  return (
    <ContractGate kind="restaurant">
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen contentStyle={{ padding: 0 }} keyboardShouldPersistTaps="handled">
      <BrandHero title="Post surplus" subtitle="Photo + weight + window. About 60 seconds, end of shift." onBack={() => navigation.goBack()} />
      <BrandSheet>
       <ResponsiveContainer maxWidth={760}>

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
        <View style={styles.impactBox}>
          <Text style={styles.impactHead}>
            ≈ {mealsFromLbs(weight).toLocaleString('en-US')} meals · {co2FromLbs(weight).toLocaleString('en-US')} lbs CO₂ avoided
          </Text>
          {humanImpactPhrase(weight) ? (
            <Text style={styles.impactSub}>{humanImpactPhrase(weight)}</Text>
          ) : null}
        </View>

        <Text style={styles.sectionLabel}>What kind of food?</Text>
        <View style={styles.chipsRow}>
          {FOOD_CATEGORIES.map((c) => (
            <TouchableOpacity
              key={c.key}
              style={[styles.chip, foodCategory === c.key && styles.chipOn]}
              onPress={() => setFoodCategory(foodCategory === c.key ? null : c.key)}
              accessibilityRole="radio"
              accessibilityState={{ selected: foodCategory === c.key }}
              activeOpacity={0.8}
            >
              <Text style={[styles.chipText, foodCategory === c.key && styles.chipTextOn]}>{c.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.sectionLabel}>How many boxes, trays or bags?</Text>
        <View style={styles.weightRow}>
          <Input
            value={packages}
            onChangeText={(v) => setPackages(v.replace(/[^\d]/g, ''))}
            keyboardType="number-pad"
            placeholder="e.g. 3"
            style={styles.weightInput}
            accessibilityLabel="Number of boxes, trays or bags"
          />
          <Text style={styles.weightUnit}>items</Text>
        </View>

        <Text style={styles.sectionLabel}>Where should it go?</Text>
        <View style={styles.chipsCol}>
          {[['network', 'Any BN receiving partner'], ['preferred', 'A partner I work with'], ['coordinator', 'Let a coordinator decide']].map(([key, label]) => (
            <TouchableOpacity key={key} style={[styles.windowChip, destinationMode === key && styles.chipOn]}
              onPress={() => setDestinationMode(key)} accessibilityRole="radio" accessibilityState={{ selected: destinationMode === key }}>
              <Text style={[styles.chipText, destinationMode === key && styles.chipTextOn]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {destinationMode === 'preferred' && (
          <View style={styles.chipsCol}>
            {partnerSites === null && <Text style={styles.partnerHelp}>Loading partners…</Text>}
            {partnerSites?.length === 0 && <Text style={styles.partnerHelp}>No partners are taking requests right now. Choose another option.</Text>}
            {partnerSites?.map((site) => (
              <TouchableOpacity key={site.id} style={[styles.windowChip, preferredSite?.id === site.id && styles.chipOn]}
                onPress={() => setPreferredSite(site)} accessibilityRole="radio" accessibilityState={{ selected: preferredSite?.id === site.id }}>
                <Text style={[styles.chipText, preferredSite?.id === site.id && styles.chipTextOn]}>{site.name}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => setOfferToNetwork((v) => !v)} accessibilityRole="checkbox"
              accessibilityState={{ checked: offerToNetwork }} style={styles.partnerCheck}>
              <Text style={styles.chipText}>{offerToNetwork ? '☑' : '☐'} If they decline or don’t answer, offer it to other BN partners</Text>
            </TouchableOpacity>
            <Text style={styles.partnerHelp}>Asking a partner is a request — they confirm whether they can take it.</Text>
          </View>
        )}

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

        <Text style={styles.optional}>Volunteers only see this after a receiving partner confirms they can take it.</Text>

        {/* Notes (optional) */}
        <Text style={styles.sectionLabel}>Notes <Text style={styles.optional}>(optional)</Text></Text>
        <Input
          placeholder="e.g., Use back door, ask for Mike"
          value={notes}
          onChangeText={setNotes}
          multiline
          style={{ height: 70 }}
        />

        <View style={styles.submit}>
          <PaperPlaneButton title="Send food offer" sentTitle="Offer sent" onPress={handlePost}
            onSent={() => notifyThen('Donation posted', postedNote.current, () => navigation.goBack())} />
        </View>
        {posting && !!photoUri && (
          <View style={styles.uploadingHint}>
            <ActivityIndicator size="small" color={Colors.green} />
            <Text style={styles.uploadingText}>Uploading photo…</Text>
          </View>
        )}
       </ResponsiveContainer>
      </BrandSheet>
    </Screen>
    </KeyboardAvoidingView>
    </ContractGate>
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
  partnerHelp: { fontSize: 13, color: Colors.gray, lineHeight: 18 },
  partnerCheck: { paddingVertical: 10, minHeight: 44, justifyContent: 'center' },
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
  impactBox: {
    marginTop: 12,
    padding: 12,
    backgroundColor: Colors.greenLight,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(27,94,63,0.14)',
  },
  impactHead: { fontSize: 13, fontWeight: '800', color: '#1B5E3F', letterSpacing: 0.2 },
  impactSub: { fontSize: 12, fontWeight: '600', color: '#1B5E3F', marginTop: 4, opacity: 0.85 },

  submit: { marginTop: 24 },
  uploadingHint: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    justifyContent: 'center', marginTop: 8,
  },
  uploadingText: { ...Type.caption },
});
