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
import { claimPickup, setPickupEnroute, completePickup, cancelClaim } from '../../services/database';
import { notify, notifyThen, confirm } from '../../services/ui';
import Screen from '../../components/ui/Screen';

export default function PickupDetail({ route, navigation }) {
  const pickupId = route?.params?.pickupId;
  const user = useAuthStore((s) => s.user);
  const [pickup, setPickup] = useState(route?.params?.pickup || null);
  const [busy, setBusy] = useState(false);
  const [chosenFridge, setChosenFridge] = useState(null);
  const [weight, setWeight] = useState('');

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
    setBusy(true);
    try {
      await claimPickup(pickup.id, user.id);
      await refresh();
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

        <PickupCard pickup={pickup} cta={cta} />

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
});
