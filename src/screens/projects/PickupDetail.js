// Pickup detail — DoorDash-style step-through for an active pickup.
//
// State machine driven by pickup.status:
//   available → [Claim]    →  claimed
//   claimed   → [On my way] →  enroute  (volunteer optionally picks fridge)
//   enroute   → [Delivered] →  completed (with optional weight correction)
//
// We don't gate fridge selection at Claim: the restaurant may have
// pre-picked one. If not, the picker shows once the volunteer is heading
// out so they can commit to a destination before we mark them en route.
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { Colors, Type, Radius } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import Input from '../../components/ui/Input';
import ResponsiveContainer from '../../components/ui/ResponsiveContainer';
import PickupCard from '../../components/pickup/PickupCard';
import FridgePicker from '../../components/ui/FridgePicker';
import AnimatedPressable from '../../components/ui/AnimatedPressable';
import Icon from '../../components/ui/Icon';
import useAuthStore from '../../store/authStore';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { claimPickup, setPickupEnroute, completePickup, cancelClaim, verifyPickupByRestaurant } from '../../services/database';
import { getProfile } from '../../services/auth';
import { openInMaps, openDirections, getCurrentPosition, milesBetween } from '../../services/maps';
import { requireVerifiedId } from '../../services/idGate';
import { notify, notifyThen, confirm } from '../../services/ui';
import Screen from '../../components/ui/Screen';
import { Image, TouchableOpacity } from 'react-native';

export default function PickupDetail({ route, navigation }) {
  const pickupId = route?.params?.pickupId;
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [pickup, setPickup] = useState(route?.params?.pickup || null);
  const [busy, setBusy] = useState(false);
  const [chosenFridge, setChosenFridge] = useState(null);
  const [weight, setWeight] = useState('');
  const [myLoc, setMyLoc] = useState(null);
  // Restaurant verifying that the volunteer just walked in to pick up.
  const [verifying, setVerifying] = useState(false);

  // Try once on mount to grab the volunteer's location so we can
  // show a "X mi away" badge and pre-fill the directions origin.
  useEffect(() => {
    if (Platform.OS !== 'web') return; // native needs expo-location, follow-up
    getCurrentPosition().then(setMyLoc).catch(() => {});
  }, []);

  const restaurantPos = (pickup?.restaurant_lat != null && pickup?.restaurant_lng != null)
    ? { lat: pickup.restaurant_lat, lng: pickup.restaurant_lng }
    : null;
  const distanceMi = (myLoc && restaurantPos) ? milesBetween(myLoc, restaurantPos) : null;
  const userIsRestaurant = (user?.role === 'restaurant')
    && (user?.restaurant_id === pickup?.restaurant_id || user?.id === pickup?.restaurant_id);

  async function handleVerify() {
    setVerifying(true);
    try {
      await verifyPickupByRestaurant(pickup.id, user?.id);
      await refresh();
      notify('Verified', 'Volunteer pickup confirmed. They can mark the run delivered when they drop it off.');
    } catch (e) {
      notify('Could not verify', e?.message || 'Try again.');
    } finally { setVerifying(false); }
  }

  useEffect(() => {
    if (!pickupId || pickup) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'pickups', pickupId));
        if (snap.exists()) setPickup({ id: snap.id, ...snap.data() });
      } catch (e) { console.warn('pickup load', e); }
    })();
  }, [pickupId, pickup]);

  if (!pickup) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={Colors.green} />
      </View>
    );
  }

  async function refresh() {
    try {
      const snap = await getDoc(doc(db, 'pickups', pickup.id));
      if (snap.exists()) setPickup({ id: snap.id, ...snap.data() });
    } catch {}
  }

  async function handleClaim() {
    // ID gate fires on commit (claim), not on preview. The volunteer
    // can see every detail of the pickup before being asked to
    // verify; only the actual claim requires an approved ID.
    if (!requireVerifiedId(user, navigation)) return;
    const ok = await confirm(
      'Claim this pickup?',
      `You're committing to picking this up${pickup.pickup_window_until ? ' by ' + new Date(pickup.pickup_window_until).toLocaleString() : ''}. Releasing a claimed pickup costs leaderboard points — only claim if you can make the run.`
    );
    if (!ok) return;
    setBusy(true);
    try {
      await claimPickup(pickup.id, user.id);
      await refresh();
      notify('Claimed', "You're on the hook. Directions and 'On my way' are below.");
    } catch (e) {
      notify('Could not claim', e?.message || 'Try again.');
    } finally { setBusy(false); }
  }

  async function handleEnroute() {
    if (!pickup.fridge_id && !chosenFridge) {
      notify('Pick a drop-off fridge', 'Choose where you’ll bring the food.');
      return;
    }
    setBusy(true);
    try {
      await setPickupEnroute(pickup.id, { fridgeId: chosenFridge || pickup.fridge_id });
      await refresh();
    } catch (e) {
      notify('Could not update', e?.message || 'Try again.');
    } finally { setBusy(false); }
  }

  async function handleCancelClaim() {
    const ok = await confirm(
      'Release this pickup?',
      'It goes back on the board for another volunteer. Only do this if you can’t make the run.'
    );
    if (!ok) return;
    setBusy(true);
    try {
      await cancelClaim(pickup.id);
      notifyThen('Released', 'Thanks for letting us know. The pickup is open again.', () => navigation.goBack());
    } catch (e) {
      notify('Could not release', e?.message || 'Try again.');
    } finally { setBusy(false); }
  }

  async function handleDelivered() {
    setBusy(true);
    try {
      const w = weight ? parseFloat(weight) : undefined;
      await completePickup(pickup.id, w);
      await refresh();
      // Pull the freshly bumped user doc so Profile / Impact /
      // Leaderboard show the updated lbs_rescued + hours the moment
      // the volunteer pops back. Without this the screens stay stuck
      // on the pre-pickup numbers until the next sign-in.
      try {
        if (user?.id) {
          const fresh = await getProfile(user.id);
          if (fresh && setUser) setUser({ ...user, ...fresh });
        }
      } catch (e) { console.warn('user refresh after pickup', e); }
      notifyThen('Delivered', 'Thanks for the run — your impact is logged.', () => navigation.goBack());
    } catch (e) {
      notify('Could not complete', e?.message || 'Try again.');
    } finally { setBusy(false); }
  }

  // CTA depends on status. We only render one primary at a time so it's
  // never ambiguous what the volunteer should tap next.
  let cta = null;
  if (pickup.status === 'available') {
    cta = { label: busy ? 'Claiming…' : 'Claim pickup', onPress: handleClaim, loading: busy };
  } else if (pickup.status === 'claimed') {
    cta = { label: busy ? 'Updating…' : 'I’m on my way', onPress: handleEnroute, loading: busy };
  } else if (pickup.status === 'enroute') {
    cta = { label: busy ? 'Saving…' : 'Mark delivered', onPress: handleDelivered, loading: busy };
  }

  const needsFridge = pickup.status === 'claimed' && !pickup.fridge_id;

  return (
    <Screen contentStyle={styles.content}>
      <ResponsiveContainer maxWidth={720}>
        <AnimatedPressable onPress={() => navigation.goBack()} style={styles.back} scaleTo={0.97}>
          <Icon name="back" size={18} color={Colors.green} />
          <Text style={styles.backText}>Back</Text>
        </AnimatedPressable>
        <BrushText variant="screenTitle" style={styles.title}>Pickup</BrushText>

        {pickup.status === 'available' ? (
          <View style={styles.previewBanner}>
            <Text style={styles.previewBannerTitle}>Preview · not claimed yet</Text>
            <Text style={styles.previewBannerBody}>
              Look at the photo, address, distance, and notes below. When you're ready, tap “Claim pickup” to commit — releasing a claim later costs leaderboard points.
            </Text>
          </View>
        ) : null}

        <PickupCard pickup={pickup} cta={cta} />

        {/* Food photo */}
        {pickup.photo_url ? (
          <Image source={{ uri: pickup.photo_url }} style={styles.photo} resizeMode="cover" />
        ) : null}

        {/* Address + directions + distance */}
        {pickup.restaurant_address || restaurantPos ? (
          <View style={styles.locCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.locLabel}>Pickup location</Text>
              <Text style={styles.locAddress}>
                {pickup.restaurant_name || pickup.restaurant_business_name || 'Partner restaurant'}
              </Text>
              {pickup.restaurant_address ? (
                <Text style={styles.locSub} selectable>{pickup.restaurant_address}</Text>
              ) : null}
              {distanceMi != null ? (
                <Text style={styles.locDist}>
                  ~{distanceMi < 10 ? distanceMi.toFixed(1) : Math.round(distanceMi)} mi from you
                </Text>
              ) : null}
            </View>
            <View style={styles.locBtnCol}>
              <TouchableOpacity
                style={styles.directionsBtn}
                onPress={() => openDirections({
                  destination: restaurantPos || pickup.restaurant_address,
                  origin: myLoc || undefined,
                  label: pickup.restaurant_name,
                })}
                activeOpacity={0.85}
              >
                <Text style={styles.directionsBtnText}>Directions</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.openMapBtn}
                onPress={() => openInMaps({
                  address: pickup.restaurant_address,
                  lat: pickup.restaurant_lat,
                  lng: pickup.restaurant_lng,
                  label: pickup.restaurant_name,
                })}
                activeOpacity={0.85}
              >
                <Text style={styles.openMapBtnText}>Open in Maps</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {/* Restaurant-only: verify the volunteer arrived */}
        {userIsRestaurant && (pickup.status === 'claimed' || pickup.status === 'enroute') && !pickup.verified_by_restaurant_at ? (
          <TouchableOpacity style={styles.verifyBtn} onPress={handleVerify} disabled={verifying} activeOpacity={0.85}>
            <Text style={styles.verifyBtnText}>{verifying ? 'Verifying…' : 'Verify volunteer is here'}</Text>
          </TouchableOpacity>
        ) : null}
        {userIsRestaurant && pickup.verified_by_restaurant_at ? (
          <View style={styles.verifiedNote}>
            <Text style={styles.verifiedText}>✓ Volunteer pickup verified by you.</Text>
          </View>
        ) : null}

        {needsFridge ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Where will you drop this off?</Text>
            <Text style={styles.sectionHelp}>
              The restaurant didn’t pre-pick a fridge. Choose one in your chapter.
            </Text>
            <FridgePicker
              value={chosenFridge}
              onChange={(id) => setChosenFridge(id)}
              chapterId={user?.chapter_id}
              origin={{ lat: pickup.restaurant_lat, lng: pickup.restaurant_lng }}
            />
          </View>
        ) : null}

        {pickup.status === 'enroute' ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>
              Actual weight <Text style={styles.optional}>(optional — corrects the meal count)</Text>
            </Text>
            <Input
              value={weight}
              onChangeText={setWeight}
              placeholder={String(pickup.estimated_weight_lbs || 20)}
              keyboardType="decimal-pad"
            />
          </View>
        ) : null}

        {pickup.status === 'completed' ? (
          <View style={[styles.section, styles.doneCard]}>
            <Icon name="check-circle" size={28} color={Colors.green} />
            <Text style={styles.doneText}>This pickup is complete. Thank you.</Text>
          </View>
        ) : null}

        {/* Secondary action: release a claim. Only shown when the
            volunteer is currently the owner and hasn't started yet. */}
        {pickup.status === 'claimed' && pickup.claimed_by === user?.id ? (
          <AnimatedPressable onPress={handleCancelClaim} style={styles.releaseBtn} scaleTo={0.98}>
            <Text style={styles.releaseText}>Can’t make it? Release this pickup</Text>
          </AnimatedPressable>
        ) : null}

        {pickup.status === 'cancelled' ? (
          <View style={[styles.section, styles.cancelCard]}>
            <Icon name="alert" size={22} color={Colors.pink} />
            <Text style={styles.cancelText}>
              This pickup was cancelled{pickup.cancel_reason ? `: ${pickup.cancel_reason}` : ''}.
            </Text>
          </View>
        ) : null}
      </ResponsiveContainer>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
    ...(Platform.OS === 'web' ? { height: '100vh' } : null),
  },
  content: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  back: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 4 },
  backText: { fontSize: 15, color: Colors.green, fontWeight: '600' },
  title: { color: Colors.green, marginTop: 4, marginBottom: 16 },
  section: { marginTop: 22 },
  sectionLabel: { fontSize: 14, fontWeight: '700', color: Colors.dark, marginBottom: 6 },
  sectionHelp: { ...Type.caption, marginBottom: 12 },
  optional: { fontWeight: '500', color: Colors.gray },
  doneCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 16, marginTop: 18,
    backgroundColor: Colors.greenLight, borderRadius: Radius.lg,
  },
  doneText: { fontSize: 14, fontWeight: '700', color: Colors.green },
  releaseBtn: { alignItems: 'center', paddingVertical: 14, marginTop: 8 },
  releaseText: { fontSize: 13, fontWeight: '600', color: Colors.pink },
  cancelCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 16, marginTop: 18,
    backgroundColor: '#FFE5EE', borderRadius: Radius.lg,
  },
  cancelText: { fontSize: 14, fontWeight: '600', color: '#7A1838', flex: 1 },
  photo: { width: '100%', height: 220, borderRadius: 14, marginTop: 18, backgroundColor: '#F7F5EF' },
  locCard: {
    flexDirection: 'row', gap: 12, marginTop: 18, padding: 16,
    backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: Colors.glassBorder,
  },
  locLabel: { fontSize: 11, fontWeight: '800', color: Colors.gray, letterSpacing: 0.5, textTransform: 'uppercase' },
  locAddress: { fontSize: 16, fontWeight: '800', color: Colors.dark, marginTop: 2 },
  locSub: { ...Type.caption, marginTop: 4 },
  locDist: { fontSize: 12, fontWeight: '700', color: Colors.green, marginTop: 6 },
  locBtnCol: { gap: 8, alignItems: 'stretch' },
  directionsBtn: { backgroundColor: Colors.green, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999 },
  directionsBtnText: { color: '#FFF', fontWeight: '800', fontSize: 13, textAlign: 'center' },
  openMapBtn: { borderWidth: 1, borderColor: Colors.green, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999 },
  openMapBtnText: { color: Colors.green, fontWeight: '800', fontSize: 13, textAlign: 'center' },
  verifyBtn: { marginTop: 14, padding: 14, backgroundColor: Colors.green, borderRadius: 14, alignItems: 'center' },
  verifyBtnText: { color: '#FFF', fontWeight: '800', fontSize: 14 },
  verifiedNote: { marginTop: 14, padding: 14, backgroundColor: '#E8F5EE', borderRadius: 14 },
  verifiedText: { color: Colors.green, fontWeight: '700' },
  previewBanner: {
    backgroundColor: '#FEF9C3', borderColor: '#FDE68A', borderWidth: 1,
    borderRadius: 12, padding: 14, marginBottom: 14,
  },
  previewBannerTitle: { fontSize: 12, fontWeight: '800', color: '#854D0E', letterSpacing: 0.5, textTransform: 'uppercase' },
  previewBannerBody: { fontSize: 13, color: '#854D0E', marginTop: 4, lineHeight: 18 },
});
