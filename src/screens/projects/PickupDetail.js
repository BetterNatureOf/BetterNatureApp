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
import { View, Text, StyleSheet, ActivityIndicator, Platform, Pressable } from 'react-native';
import { Colors, Type, Radius } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import ResponsiveContainer from '../../components/ui/ResponsiveContainer';
import ActiveRescueMap from '../../components/maps/ActiveRescueMap';
import PickupCard from '../../components/pickup/PickupCard';
import PickupTimeline from '../../components/pickup/PickupTimeline';
import PickupContacts from '../../components/pickup/PickupContacts';
import { pickupDeadline, rescueOfferDeadline } from '../../services/rescueCells';
import PickupCountdown from '../../components/pickup/PickupCountdown';
import DispatchStatus from '../../components/pickup/DispatchStatus';
import FridgePicker from '../../components/ui/FridgePicker';
import AnimatedPressable from '../../components/ui/AnimatedPressable';
import Icon from '../../components/ui/Icon';
import useAuthStore from '../../store/authStore';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { confirmPickupDestination, rerouteHeldPickup, assignPickupReceiver, recordPickupReceipt, claimPickup, setPickupEnroute, completePickup, cancelClaim, verifyPickupByRestaurant, updatePickupFridge, holdPickup, closeHeldPickup, fetchCustodyVolunteers, transferPickupCustody } from '../../services/database';
import { uploadPickupPhoto } from '../../services/pickupPhotos';
import * as ImagePicker from 'expo-image-picker';
import { getProfile } from '../../services/auth';
import { openInMaps, openDirections, getCurrentPosition, milesBetween } from '../../services/maps';
import { hasRole } from '../../services/roles';
import { requireVerifiedId } from '../../services/idGate';
import { notify, notifyThen, confirm } from '../../services/ui';
import Screen from '../../components/ui/Screen';
import { Image, TouchableOpacity } from 'react-native';

const rescueTime = (ms) => new Date(ms).toLocaleString([], {
  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
});

export default function PickupDetail({ route, navigation }) {
  const pickupId = route?.params?.pickupId;
  // A cold deep link (e.g. a rescue alert) has nothing underneath it.
  const goBackOrRescue = () => (navigation.canGoBack()
    ? navigation.goBack() : navigation.navigate('MainTabs', { screen: 'Rescue' }));
  // `pickup` is an in-memory preview from the list; a reloaded URL only
  // carries the id, so ignore anything that isn't a real object.
  const previewPickup = route?.params?.pickup && typeof route.params.pickup === 'object' ? route.params.pickup : null;
  const [receivingSite, setReceivingSite] = useState('');
  const [receivingAddress, setReceivingAddress] = useState('');
  const [receivingContact, setReceivingContact] = useState('');
  const [receiptReceiver, setReceiptReceiver] = useState('');
  const [receiptWeight, setReceiptWeight] = useState('');
  const [receiverEmail, setReceiverEmail] = useState('');
  const [receivingMinutes, setReceivingMinutes] = useState('');
  const [transferOptions, setTransferOptions] = useState(null);
  const [volunteerSearch, setVolunteerSearch] = useState('');
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [pickup, setPickup] = useState(previewPickup);
  const offerDeadline = pickup?.status === 'available' ? rescueOfferDeadline(pickup) : null;
  const [, setDeadlineTick] = useState(0);
  useEffect(() => {
    const remaining = offerDeadline === null ? 0 : offerDeadline - Date.now();
    if (remaining <= 0) return;
    const timeout = setTimeout(() => setDeadlineTick((tick) => tick + 1), remaining);
    return () => clearTimeout(timeout);
  }, [offerDeadline]);
  const [busy, setBusy] = useState(false);
  const [chosenFridge, setChosenFridge] = useState(null);
  const [showFridgeChange, setShowFridgeChange] = useState(false);
  const [weight, setWeight] = useState('');
  const [dropoffPhotoUri, setDropoffPhotoUri] = useState(null); // local, pre-upload
  const [uploadedDropoffUrl, setUploadedDropoffUrl] = useState(null);
  const [uploadingProof, setUploadingProof] = useState(false);
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

  const [loadError, setLoadError] = useState(null);

  // Keep the volunteer's view current when a partner confirms handoff
  // or another volunteer claims the pickup they're previewing.
  useEffect(() => {
    if (!pickupId) {
      setLoadError('No pickup was specified.');
      return;
    }
    if (!db) {
      setLoadError('Pickups are unavailable right now.');
      return;
    }
    setLoadError(null);
    return onSnapshot(doc(db, 'pickups', pickupId), (snap) => {
      if (snap.exists()) {
        setPickup({ ...snap.data(), id: snap.id });
        setLoadError(null);
      } else {
        setLoadError('This pickup is no longer available.');
      }
    }, () => setLoadError('Couldn’t load this pickup. Go back and try again.'));
  }, [pickupId]);

  if (loadError) {
    return (
      <View style={styles.loading}>
        <Text style={{ color: Colors.dark, textAlign: 'center', padding: 24 }}>
          {loadError}
        </Text>
        <TouchableOpacity onPress={goBackOrRescue} style={{ padding: 12 }}>
          <Text style={{ color: Colors.green, fontWeight: '700' }}>‹ Back</Text>
        </TouchableOpacity>
      </View>
    );
  }
  if (!pickup || pickup.id !== pickupId) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={Colors.green} />
        <Text style={{ marginTop: 12, color: Colors.grayMid }}>Loading pickup…</Text>
      </View>
    );
  }

  async function refresh() {
    try {
      const snap = await getDoc(doc(db, 'pickups', pickup.id));
      if (snap.exists()) setPickup({ id: snap.id, ...snap.data() });
    } catch {}
  }

  async function handleConfirmDestination(backup = false) {
    const minutes = Number(receivingMinutes);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 10080) {
      notify('Enter the receiving deadline', 'Use minutes from now, up to seven days.');
      return;
    }
    const arrivalBy = Date.now() + minutes * 60_000;
    const acceptance = `Confirm ${receivingContact.trim()} at ${receivingSite.trim()} can take the full batch by ${new Date(arrivalBy).toLocaleString()}.`;
    if (!await confirm(backup ? 'Send the volunteer to this backup site?' : 'Open this offer to volunteers?',
      backup ? `${acceptance} Confirm the volunteer still has the full batch and it is safe to deliver.` : acceptance)) return;
    setBusy(true);
    try {
      const destination = { siteName: receivingSite, address: receivingAddress, contact: receivingContact, arrivalBy };
      if (backup) {
        await rerouteHeldPickup(pickup.id, { ...destination, holdReportedAt: pickup.safety_hold.reported_at });
      } else {
        await confirmPickupDestination(pickup.id, destination);
      }
      setReceivingSite('');
      setReceivingAddress('');
      setReceivingContact('');
      setReceivingMinutes('');
      await refresh();
    } catch (e) {
      notify(backup ? 'Could not confirm the backup site' : 'Could not open the offer', e?.message || 'Try again.');
    } finally { setBusy(false); }
  }

  async function handleClaim() {
    // ID gate fires on commit (claim), not on preview. The volunteer
    // can see every detail of the pickup before being asked to
    // verify; only the actual claim requires an approved ID.
    if (!requireVerifiedId(user, navigation)) return;
    // The coordinator-confirmed cutoff wins over the donor's original window.
    const claimBy = pickupDeadline(pickup.destination_confirmation?.pickup_by ?? pickup.pickup_window_until);
    const ok = await confirm(
      'Claim this pickup?',
      `You're committing to picking this up${claimBy ? ' by ' + new Date(claimBy).toLocaleString() : ''}. Releasing a claimed pickup costs leaderboard points — only claim if you can make the run.`
    );
    if (!ok) return;
    setBusy(true);
    try {
      await claimPickup(pickup.id, user.id);
      await refresh();
      if (Platform.OS !== 'web') notify('Pickup claimed', 'Your next stop is ready.');
    } catch (e) {
      notify('Could not claim', e?.message || 'Try again.');
    } finally { setBusy(false); }
  }

  async function handleEnroute() {
    if (!pickup.destination_confirmation && !pickup.fridge_id && !chosenFridge) {
      notify('Pick a drop-off fridge', 'Choose where you’ll bring the food.');
      return;
    }
    setBusy(true);
    try {
      await setPickupEnroute(pickup.id, { fridgeId: pickup.destination_confirmation ? undefined : chosenFridge || pickup.fridge_id });
      await refresh();
    } catch (e) {
      notify('Could not update', e?.message || 'Try again.');
    } finally { setBusy(false); }
  }

  async function handleCancelClaim() {
    const ok = await confirm(
      'Release this pickup?',
      'The pickup reopens if both windows are still open. Otherwise it closes. Releasing costs 5 leaderboard points and is logged as a drop.'
    );
    if (!ok) return;
    // Ask for the reason on web via prompt; on native we skip
    // (native devs can wire a picker later). The reason lets the
    // chapter pres see why runs get dropped in aggregate.
    let reason = '';
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      reason = window.prompt(
        'Why can\'t you make it? (helps the chapter improve — one sentence is fine)',
        ''
      ) || '';
    }
    setBusy(true);
    try {
      const released = await cancelClaim(pickup.id, reason.trim() || undefined);
      notifyThen('Released', released?.status === 'cancelled'
        ? 'The pickup window closed, so the offer has ended.'
        : 'The pickup is open again.', goBackOrRescue);
    } catch (e) {
      notify('Could not release', e?.message || 'Try again.');
    } finally { setBusy(false); }
  }

  // #9 from drop-off audit — change the drop-off fridge while
  // enroute. Real-world: volunteer picked A, arrives to find A
  // full/broken/closed, ends up at B. This mutates the pickup's
  // fridge_* fields so the receipt reads the correct fridge.
  async function handleChangeFridge(newFridgeId) {
    if (!newFridgeId || newFridgeId === pickup.fridge_id) {
      setShowFridgeChange(false);
      return;
    }
    setBusy(true);
    try {
      await updatePickupFridge(pickup.id, newFridgeId);
      await refresh();
      setShowFridgeChange(false);
      notify('Fridge updated', 'The tax receipt will show the new drop-off location.');
    } catch (e) {
      notify('Could not update', e?.message || 'Try again.');
    } finally { setBusy(false); }
  }

  // #11 from drop-off audit — optional "food is IN the fridge" proof
  // photo. Attaches to the pickup as dropoff_photo_url; the tax
  // receipt links it so partners can see their donation reached the
  // fridge. Kept OPTIONAL because many fridges are inside buildings
  // with poor signal — hard-requiring would strand volunteers.
  async function handleAddDropoffPhoto() {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        notify('Camera access needed', 'Grant camera access to attach a drop-off proof photo.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        quality: 0.6, allowsEditing: true,
      });
      if (result.canceled) return;
      const uri = result.assets?.[0]?.uri;
      if (!uri) return;
      setDropoffPhotoUri(uri);
      // Upload straight away so completePickup only needs the URL.
      setUploadingProof(true);
      const url = await uploadPickupPhoto(`dropoff-${pickup.id}`, uri);
      setUploadedDropoffUrl(url || null);
    } catch (e) {
      notify('Photo upload failed', e?.message || 'Try again — the tax receipt still ships without it.');
    } finally { setUploadingProof(false); }
  }

  async function handleHold(reason) {
    const ok = await confirm(
      'Put this pickup on hold?',
      'This keeps the run assigned to you and flags it for coordinator review. Contact your chapter coordinator directly for next steps.'
    );
    if (!ok) return;
    setBusy(true);
    try {
      await holdPickup(pickup.id, reason);
      await refresh();
      notify('Pickup on hold', 'Contact your chapter coordinator for next steps.');
    } catch (e) {
      notify('Could not save the hold', e?.message || 'Contact your chapter coordinator.');
    } finally { setBusy(false); }
  }

  async function handleCloseHold(outcome) {
    const returned = outcome === 'returned_to_donor';
    const ok = await confirm(
      returned ? 'Confirm food was returned?' : 'Confirm food was discarded?',
      'Record this only after you have verified what happened. Closing the run does not record a delivery.'
    );
    if (!ok) return;
    setBusy(true);
    try {
      await closeHeldPickup(pickup.id, outcome);
      await refresh();
    } catch (e) {
      notify('Could not close the hold', e?.message || 'Try again.');
    } finally { setBusy(false); }
  }

  async function loadTransferOptions() {
    setBusy(true);
    try {
      setVolunteerSearch('');
      setTransferOptions(await fetchCustodyVolunteers(pickup.chapter_id, pickup.claimed_by));
    } catch (e) {
      notify('Could not load volunteers', e?.message || 'Try again.');
    } finally { setBusy(false); }
  }

  async function handleTransfer(volunteer) {
    if (!await confirm(
      `Record handoff to ${volunteer.name}?`,
      'Confirm both volunteers reported the physical handoff, required food handling checks passed, and the new volunteer can make the receiving deadline.',
    )) return;
    setBusy(true);
    try {
      await transferPickupCustody(pickup.id, pickup.claimed_by, volunteer.id, pickup.safety_hold.reported_at);
      setTransferOptions(null);
      await refresh();
    } catch (e) {
      notify('Could not record the handoff', e?.message || 'Try again.');
    } finally { setBusy(false); }
  }

  async function handleAssignReceiver() {
    setBusy(true);
    try {
      await assignPickupReceiver(pickup.id, receiverEmail.trim());
      setReceiverEmail('');
      await refresh();
      notify('Receiver assigned', 'Their Better Nature inbox now has the rescue.');
    } catch (e) {
      notify('Could not assign the receiver', e?.message || 'Try again.');
    } finally { setBusy(false); }
  }

  async function handleRecordReceipt(fromReceivingSite = false) {
    const actual = Number(receiptWeight);
    if (!receiptReceiver.trim() || !Number.isFinite(actual) || actual <= 0) {
      notify('Receipt details required', 'Enter who accepted the food and the actual pounds they received.');
      return;
    }
    if (!await confirm('Confirm the full handoff?',
      `Record that the site received the full batch, weighing ${actual} lb.`)) return;
    setBusy(true);
    try {
      await recordPickupReceipt(pickup.id, { receiverName: receiptReceiver, weightLbs: actual, fromReceivingSite });
      await refresh();
    } catch (e) {
      notify('Could not record receipt', e?.message || 'Try again.');
    } finally { setBusy(false); }
  }

  async function handleReceivingIssue() {
    if (!await confirm('Pause this delivery?', 'Call your chapter coordinator to agree on what happens to the food before the volunteer leaves.')) return;
    setBusy(true);
    try {
      await holdPickup(pickup.id, 'destination_unavailable');
      await refresh();
    } catch (e) {
      notify('Could not pause delivery', e?.message || 'Call your chapter coordinator.');
    } finally { setBusy(false); }
  }

  async function handleDelivered() {
    // Client-side weight check — required now (service enforces too).
    const w = pickup.destination_confirmation ? pickup.receiving_receipt?.weight_lbs : (weight ? parseFloat(weight) : NaN);
    if (!Number.isFinite(w) || w <= 0) {
      notify('Weight required', 'Enter the actual pounds you delivered — the tax receipt reads from this number.');
      return;
    }
    // Sanity-check drift from the restaurant's estimate before the
    // receipt ships. Every partner receipt should match the food they
    // actually gave; a 30%+ drift is worth one confirmation tap.
    const est = Number(pickup?.estimated_weight_lbs || 0);
    if (est > 0) {
      const drift = Math.abs(w - est) / est;
      if (drift > 0.3) {
        const ok = await confirm(
          'Weight looks off',
          `Restaurant estimated ${est} lbs, you entered ${w} lbs. That's ${Math.round(drift * 100)}% off. The tax receipt will use your number. Continue?`
        );
        if (!ok) return;
      }
    }
    setBusy(true);
    try {
      await completePickup(pickup.id, w, {
        dropoffPhotoUrl: uploadedDropoffUrl || undefined,
      });
      await refresh();
      // Pull the freshly bumped user doc so Profile / Impact /
      // Leaderboard show the updated lbs_rescued + hours the moment
      // the volunteer pops back.
      try {
        if (user?.id) {
          const fresh = await getProfile(user.id);
          if (fresh && setUser) setUser({ ...user, ...fresh });
        }
      } catch (e) { console.warn('user refresh after pickup', e); }
      notify('Delivered', 'Nice run. Your impact is logged.');
    } catch (e) {
      // Map service-layer guard codes → actionable messages. Anything
      // unmapped falls through to the raw error string.
      const code = e?.code || '';
      if (code === 'handoff_not_confirmed') {
        // Attest-and-continue escape hatch — real-world restaurants
        // sometimes miss the confirm push (busy service, phone away).
        // Volunteer types a one-liner note; completion proceeds with
        // handoff_unverified flag on the pickup + receipt so the
        // partner + exec can see it happened. Not a rug-pull — the
        // audit trail is the trust mechanism.
        let note = '';
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          note = window.prompt(
            "The restaurant hasn't confirmed handoff yet.\n\n" +
            "If they truly gave you the food but haven't tapped Confirm, " +
            "type a one-line note (staff busy, phone dead, etc.) and we'll " +
            "complete the run with an audit note on the receipt. Otherwise cancel and wait.",
            ''
          ) || '';
        } else {
          const ok = await confirm(
            "Restaurant hasn't confirmed handoff",
            "If they truly gave you the food but haven't tapped Confirm, tap OK to complete with an audit note. Otherwise wait for them."
          );
          note = ok ? 'volunteer attest (native — no note UI yet)' : '';
        }
        if (!note.trim()) return;
        setBusy(true);
        try {
          await completePickup(pickup.id, w, {
            dropoffPhotoUrl: uploadedDropoffUrl || undefined,
            unverifiedNote: note.trim(),
          });
          await refresh();
          notify('Delivered', 'Marked delivered with an audit note — the restaurant sees the flag on the receipt.');
        } catch (e2) {
          notify('Could not complete', e2?.message || 'Try again.');
        } finally { setBusy(false); }
      } else if (code === 'not_enroute') {
        notify(
          'Tap "I\'m on my way" first',
          "The pickup has to be marked en route before you can mark it delivered — that's how the restaurant knows the food's already out."
        );
      } else if (code === 'weight_required') {
        notify('Weight required', 'Enter the actual pounds you delivered before submitting.');
      } else if (code === 'claimant_disabled') {
        notify(
          'Account disabled',
          'This account has been disabled. Email info@betternatureofficial.org to sort it out.'
        );
      } else {
        notify('Could not complete', e?.message || 'Try again.');
      }
    } finally { setBusy(false); }
  }

  // CTA depends on status. We only render one primary at a time so it's
  // never ambiguous what the volunteer should tap next.
  const isClaimant = !!user?.id && pickup.claimed_by === user.id;
  const onHold = !!pickup.safety_hold && ['claimed', 'enroute'].includes(pickup.status);
  const chapterLead = hasRole(user, ['executive', 'admin', 'super_admin']) || (!!pickup.chapter_id &&
    pickup.chapter_id === user?.chapter_id && hasRole(user, ['chapter_president', 'chapter_pres']));
  const canCloseHold = onHold && chapterLead;
  const waitingForSite = ['pending_destination', 'available'].includes(pickup.status) && !pickup.destination_confirmation;
  const staff = hasRole(user, ['executive', 'admin', 'super_admin']);
  const chapterCoordinator = staff || (pickup.chapter_id && pickup.chapter_id === user?.chapter_id &&
    hasRole(user, ['chapter_president', 'chapter_pres']));
  const canTransfer = onHold && chapterCoordinator && pickup.status === 'enroute' &&
    pickup.safety_hold.reason === 'cannot_continue' && pickup.verified_by_restaurant_at &&
    !pickup.receiving_receipt && (pickupDeadline(pickup.destination_confirmation?.arrival_by) ?? 0) > Date.now();
  const matchingVolunteers = transferOptions?.filter((volunteer) =>
    `${volunteer.name} ${volunteer.email}`.toLowerCase().includes(volunteerSearch.trim().toLowerCase()));
  const canConfirmSite = waitingForSite && chapterCoordinator;
  const canReroute = chapterCoordinator && onHold && pickup.safety_hold.reason === 'destination_unavailable' &&
    pickup.status === 'enroute' && !!pickup.claimed_by && !!pickup.destination_confirmation &&
    !!pickup.verified_by_restaurant_at && !pickup.receiving_receipt;
  const waitingForReceipt = !onHold && pickup.status === 'enroute' && !!pickup.destination_confirmation && !pickup.receiving_receipt;
  const canRecordReceipt = waitingForReceipt && staff && !!pickup.verified_by_restaurant_at;
  const arrivalBy = pickupDeadline(pickup.destination_confirmation?.arrival_by);
  const pickupBy = pickupDeadline(pickup.destination_confirmation?.pickup_by ?? pickup.pickup_window_until);
  const isReceiver = !!user?.id && pickup.receiver_uid === user.id;
  const canAssignReceiver = staff && !!pickup.destination_confirmation && !pickup.receiving_receipt &&
    !onHold && ['available', 'claimed', 'enroute'].includes(pickup.status);
  const offerExpired = pickup.status === 'available' && !waitingForSite && (offerDeadline ?? 0) <= Date.now();
  let cta = null;
  if (user?.id && !userIsRestaurant && !isReceiver && pickup.status === 'available' && !waitingForSite && !offerExpired) {
    cta = { label: busy ? 'Accepting…' : 'Accept pickup', onPress: handleClaim, loading: busy };
  } else if (isClaimant && pickup.status === 'claimed') {
    cta = { label: busy ? 'Updating…' : 'I’m on my way', onPress: handleEnroute, loading: busy };
  } else if (isClaimant && pickup.status === 'enroute' && !waitingForReceipt) {
    cta = { label: busy ? 'Saving…' : 'Mark delivered', onPress: handleDelivered, loading: busy };
  }

  const showTripMap = !onHold && isClaimant && ['claimed', 'enroute'].includes(pickup.status);
  const droppingOff = !!pickup.verified_by_restaurant_at;
  const nextStop = droppingOff ? {
    name: pickup.fridge_name || 'Community fridge',
    address: pickup.fridge_address,
    lat: pickup.fridge_lat,
    lng: pickup.fridge_lng,
  } : {
    name: pickup.restaurant_name || 'Food partner',
    address: pickup.restaurant_address,
    lat: pickup.restaurant_lat,
    lng: pickup.restaurant_lng,
  };
  const needsFridge = !onHold && isClaimant && pickup.status === 'claimed' && !pickup.fridge_id && !pickup.destination_confirmation;
  const reviewing = cta && pickup.status === 'available' && !staff && !onHold;
  const nextAction = cta && (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: cta.loading, busy: cta.loading }}
      disabled={cta.loading} onPress={cta.onPress}
      style={({ pressed }) => [styles.rescueAction, (pressed || cta.loading) && { opacity: 0.75 }]}>
      <Text style={styles.rescueActionLabel}>{cta.label}</Text>
    </Pressable>
  );
  const actionInTrip = showTripMap && cta && !needsFridge;

  if (isReceiver && !staff) {
    const canReceive = waitingForReceipt && !!pickup.verified_by_restaurant_at && !isClaimant;
    return (
      <Screen contentStyle={styles.content}>
        <ResponsiveContainer maxWidth={560}>
          <AnimatedPressable onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Notifications')}
            style={styles.back} scaleTo={0.97}>
            <Icon name="back" size={18} color={Colors.green} />
            <Text style={styles.backText}>Back</Text>
          </AnimatedPressable>
          <BrushText variant="screenTitle" style={styles.title}>Receive food</BrushText>
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>{pickup.destination_confirmation?.site_name}</Text>
            <Text style={styles.sectionHelp}>{pickup.destination_confirmation?.address}</Text>
            <Text style={styles.sectionHelp}>Expected batch · {pickup.destination_confirmation?.accepted_weight_lbs} lb</Text>
            {arrivalBy !== null && <Text style={styles.sectionHelp}>Receiving deadline · {new Date(arrivalBy).toLocaleString()}</Text>}
          </View>
          {canReceive ? (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Confirm after the food arrives</Text>
              <Text style={styles.sectionHelp}>If you can only take part of the batch or need to decline it, report a problem and contact your coordinator before the volunteer leaves.</Text>
              <Input label="Your name" value={receiptReceiver} onChangeText={setReceiptReceiver} />
              <Input label="Actual pounds accepted" value={receiptWeight} onChangeText={setReceiptWeight} keyboardType="decimal-pad" />
              <Button title="Confirm full receipt" loading={busy} onPress={() => handleRecordReceipt(true)} />
              <Button title="Report a receiving problem" variant="secondary" disabled={busy} onPress={handleReceivingIssue} />
            </View>
          ) : (
            <Text style={styles.sectionHelp} accessibilityRole="alert">
              {pickup.receiving_receipt ? `Receipt recorded · ${pickup.receiving_receipt.weight_lbs} lb`
                : onHold ? 'Delivery paused. Contact your chapter coordinator.'
                : pickup.status === 'cancelled' ? 'This delivery was cancelled.'
                : 'Waiting for the donor to confirm the pickup.'}
            </Text>
          )}
        </ResponsiveContainer>
      </Screen>
    );
  }

  return (
    <Screen contentStyle={styles.content}>
      <ResponsiveContainer maxWidth={720}>
        <AnimatedPressable onPress={goBackOrRescue} style={styles.back} scaleTo={0.97}>
          <Icon name="back" size={18} color={Colors.green} />
          <Text style={styles.backText}>Back</Text>
        </AnimatedPressable>
        {reviewing || showTripMap ? (
          <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={styles.rescueTitle}>{reviewing ? 'Review pickup' : 'Your rescue'}</Text>
        ) : <BrushText variant="screenTitle" style={styles.title}>Pickup</BrushText>}

        {(offerExpired || (!isClaimant && !userIsRestaurant && !staff &&
          ['claimed', 'enroute', 'cancelled', 'completed'].includes(pickup.status))) && (
          <View style={styles.previewBanner}>
            <Text style={styles.previewBannerTitle}>This pickup is no longer available</Text>
            <Button title="Browse open pickups" variant="secondary" onPress={() => navigation.navigate('Pickups')} />
          </View>
        )}
        {chapterCoordinator && ['available', 'claimed'].includes(pickup.status) && (
          <DispatchStatus pickupId={pickup.id} />
        )}
        {waitingForSite && (
          <View style={styles.previewBanner}>
            <Text style={styles.previewBannerTitle}>Waiting for a receiving site</Text>
            <Text style={styles.previewBannerBody}>The offer opens after a coordinator confirms the full batch and receiving deadline.</Text>
          </View>
        )}
        {(canConfirmSite || canReroute) && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>{canReroute ? 'Confirm a backup receiving site' : 'Confirm a staffed receiving site'}</Text>
            {canReroute && <Text style={styles.sectionHelp}>Call the backup site and the assigned volunteer first. If any food has already been accepted or there is a food safety concern, keep the run paused for review.</Text>}
            <Input label="Receiving site" value={receivingSite} onChangeText={setReceivingSite} />
            <Input label="Receiving address" value={receivingAddress} onChangeText={setReceivingAddress} />
            <Input label="Staff member who accepted" value={receivingContact} onChangeText={setReceivingContact} />
            <Input label="Receiving deadline (minutes from now)" keyboardType="number-pad" value={receivingMinutes} onChangeText={setReceivingMinutes} />
            <Button title={canReroute ? 'Confirm backup and resume rescue' : 'Confirm destination and open offer'}
              onPress={() => handleConfirmDestination(canReroute)} loading={busy} />
          </View>
        )}
        {arrivalBy !== null && !reviewing && !showTripMap && (
          <Text style={styles.sectionHelp}>Confirmed receiving deadline: {new Date(arrivalBy).toLocaleString()}</Text>
        )}
        {waitingForReceipt && !showTripMap && (
          <Text style={styles.sectionHelp}>{pickup.verified_by_restaurant_at
            ? 'Waiting for the receiving site to confirm the handoff.'
            : 'Waiting for the donor to confirm collection.'}</Text>
        )}
        {canAssignReceiver && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>{pickup.receiver_uid ? 'Change receiving staff' : 'Assign receiving staff'}</Text>
            <Text style={styles.sectionHelp}>Give a staff member at this site access to confirm this rescue using their verified Better Nature account.</Text>
            <Input label="Receiving staff account email" value={receiverEmail} onChangeText={setReceiverEmail}
              keyboardType="email-address" autoCapitalize="none" />
            <Button title={pickup.receiver_uid ? 'Replace receiver' : 'Assign receiver'} variant="secondary" disabled={!receiverEmail.trim()} loading={busy} onPress={handleAssignReceiver} />
          </View>
        )}
        {canRecordReceipt && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Record what the site received</Text>
            <Input label="Staff member who received the food" value={receiptReceiver} onChangeText={setReceiptReceiver} />
            <Input label="Actual pounds accepted" value={receiptWeight} onChangeText={setReceiptWeight} keyboardType="decimal-pad" />
            <Button title="Record receiving confirmation" loading={busy} onPress={() => handleRecordReceipt(isReceiver)} />
          </View>
        )}
        {pickup.receiving_receipt && (
          <Text style={styles.sectionHelp}>Receiving site confirmed {pickup.receiving_receipt.weight_lbs} lb.</Text>
        )}
        {!!pickup.destination_history?.length && !onHold && (
          <Text style={styles.sectionHelp} accessibilityRole="alert">The drop-off changed. Use the current address for {pickup.fridge_name}.</Text>
        )}
        {onHold && (
          <View style={styles.previewBanner} accessibilityRole="alert">
            <Text style={styles.previewBannerTitle}>Pickup on hold</Text>
            <Text style={styles.previewBannerBody}>The run is still assigned. Contact your chapter coordinator before continuing.</Text>
          </View>
        )}
        {canCloseHold && (
          <View style={styles.problemRow}>
            <Button title="Record return" variant="secondary" disabled={busy} onPress={() => handleCloseHold('returned_to_donor')} />
            <Button title="Record disposal" variant="secondary" disabled={busy} onPress={() => handleCloseHold('discarded')} />
          </View>
        )}
        {canTransfer && (
          <View style={styles.problemRow}>
            <Text style={styles.sectionLabel}>Transfer this rescue</Text>
            <Text style={styles.sectionHelp}>Coordinate the handoff with both volunteers. Record it once the replacement has the food.</Text>
            {transferOptions === null ? (
              <Button title="Find a replacement volunteer" variant="secondary" disabled={busy} onPress={loadTransferOptions} />
            ) : (
              <>
                <Input label="Find a volunteer" value={volunteerSearch} onChangeText={setVolunteerSearch} placeholder="Name or email" />
                {matchingVolunteers.length === 0 && (
                  <Text style={styles.sectionHelp}>{transferOptions.length ? 'No volunteers match that search.' : 'No eligible replacement volunteers in this chapter.'}</Text>
                )}
                {matchingVolunteers.slice(0, 5).map((volunteer) => (
                  <Button key={volunteer.id} title={volunteer.email ? `${volunteer.name} · ${volunteer.email}` : volunteer.name}
                    variant="secondary" disabled={busy} onPress={() => handleTransfer(volunteer)} />
                ))}
                {matchingVolunteers.length > 5 && <Text style={styles.sectionHelp}>Search by name or email to narrow the list.</Text>}
              </>
            )}
          </View>
        )}
        {pickup.custody_transfer && (
          <Text style={styles.sectionHelp}>Coordinator recorded a volunteer handoff. Current assignment: {pickup.claimant_name || 'Replacement volunteer'}.</Text>
        )}
        {showTripMap && <ActiveRescueMap stop={nextStop} droppingOff={droppingOff}
          action={actionInTrip ? nextAction : null}
          status={droppingOff
            ? [arrivalBy !== null ? `Drop off by ${rescueTime(arrivalBy)}` : '',
              waitingForReceipt ? 'The receiving site confirms the handoff.' : ''].filter(Boolean).join(' · ')
            : pickup.status === 'enroute' ? 'Ask the donor to confirm collection when you arrive.'
              : pickupBy !== null ? `Pick up by ${rescueTime(pickupBy)}` : ''} />}
        {!showTripMap && !onHold && isClaimant && pickup.status === 'enroute' && droppingOff && pickup.destination_confirmation && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>{pickup.fridge_name}</Text>
            <Text style={styles.sectionHelp} selectable>{pickup.fridge_address}</Text>
            <Button title="Directions to drop-off" variant="secondary"
              onPress={() => openDirections({ destination: pickup.fridge_address, label: pickup.fridge_name })} />
          </View>
        )}

        {/* Countdown — remaining time in the restaurant's window.
            Renders on every state (preview, claimed, enroute) so
            volunteers see urgency BEFORE they claim too. */}
        {!reviewing && !showTripMap && <PickupCountdown pickup={pickup} style={{ marginBottom: 12 }} />}

        {/* Timeline — shows where in the flow this run is at a
            glance, on both restaurant and volunteer views. Only
            once the pickup is past 'available' — a preview card
            doesn't need the ladder. */}
        {pickup.status !== 'available' ? <PickupTimeline pickup={pickup} /> : null}

        {/* Contact cards. Restaurant sees the volunteer's phone
            once claimed; volunteer sees the restaurant's phone
            once claimed. Both sides can call/text the moment
            something goes sideways at the door. */}
        {(isClaimant || userIsRestaurant) && ['claimed', 'enroute'].includes(pickup.status) ? (
          userIsRestaurant
            ? <PickupContacts pickup={pickup} side="restaurant" />
            : <PickupContacts pickup={pickup} side="volunteer" />
        ) : null}

        {pickup.status === 'available' && !waitingForSite && !offerExpired && !reviewing ? (
          <View style={styles.previewBanner}>
            <Text style={styles.previewBannerTitle}>Review your route</Text>
            <Text style={styles.previewBannerBody}>
              Check both stops and the pickup window before accepting. Releasing an accepted pickup costs leaderboard points.
            </Text>
          </View>
        ) : null}

        <PickupCard pickup={pickup} showPhoto={false} showMapLinks={!reviewing && !showTripMap && !onHold}
          showCountdown={!reviewing && !showTripMap} />
        {reviewing && (
          <View style={styles.reviewActions}>
            <Text style={styles.reviewTime}>Pick up by {rescueTime(pickupBy)}</Text>
            <Text style={styles.reviewTime}>Drop off by {rescueTime(arrivalBy)}</Text>
            <Text style={styles.reviewHint}>Accept if you can make both stops. Releasing a claim costs 5 leaderboard points.</Text>
            {nextAction}
          </View>
        )}

        {/* Food photo */}
        {pickup.photo_url ? (
          <Image source={{ uri: pickup.photo_url }} style={styles.photo} resizeMode="cover" />
        ) : null}

        {/* Address + directions + distance */}
        {!reviewing && !showTripMap && !onHold && (!isClaimant || !droppingOff) && (pickup.restaurant_address || restaurantPos) ? (
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
        {!onHold && userIsRestaurant && (pickup.status === 'claimed' || pickup.status === 'enroute') && !pickup.verified_by_restaurant_at ? (
          <TouchableOpacity style={styles.verifyBtn} onPress={handleVerify} disabled={verifying} activeOpacity={0.85}>
            <Text style={styles.verifyBtnText}>{verifying ? 'Verifying…' : 'Verify volunteer is here'}</Text>
          </TouchableOpacity>
        ) : null}
        {userIsRestaurant && pickup.verified_by_restaurant_at ? (
          <View style={styles.verifiedNote}>
            <Text style={styles.verifiedText}>✓ Volunteer pickup verified by you.</Text>
          </View>
        ) : null}
        {/* Volunteer-side milestone — once the restaurant confirms,
            the volunteer sees a clear "half-way" banner so they know
            the handoff is proven and only the drop remains. */}
        {isClaimant && pickup.verified_by_restaurant_at && pickup.status !== 'completed' ? (
          <View style={styles.verifiedNote}>
            <Text style={styles.verifiedText}>
              ✓ {pickup.restaurant_name || 'Restaurant'} confirmed pickup. Head to the drop and mark it delivered.
            </Text>
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

        {/* Change fridge — visible while enroute so a volunteer who
            gets redirected (fridge full/closed) can update the drop-
            off. The receipt reads from these fields, so this can't
            wait until after completion. #9 from drop-off audit. */}
        {!pickup.destination_confirmation && !onHold && isClaimant && pickup.status === 'enroute' ? (
          <View style={styles.section}>
            <View style={styles.rowBetween}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionLabel}>Drop-off fridge</Text>
                <Text style={styles.sectionHelp}>
                  {pickup.fridge_name || 'Not set'}
                  {pickup.fridge_address ? ` · ${pickup.fridge_address}` : ''}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowFridgeChange((v) => !v)} style={styles.linkBtn}>
                <Text style={styles.linkBtnText}>
                  {showFridgeChange ? 'Cancel' : 'Change'}
                </Text>
              </TouchableOpacity>
            </View>
            {showFridgeChange ? (
              <View style={{ marginTop: 10 }}>
                <FridgePicker
                  value={chosenFridge || pickup.fridge_id}
                  onChange={(id) => setChosenFridge(id)}
                  chapterId={user?.chapter_id}
                  origin={{ lat: pickup.restaurant_lat, lng: pickup.restaurant_lng }}
                />
                <TouchableOpacity
                  style={styles.saveFridgeBtn}
                  onPress={() => handleChangeFridge(chosenFridge)}
                  disabled={!chosenFridge || busy}
                  activeOpacity={0.85}
                >
                  <Text style={styles.saveFridgeBtnText}>
                    {busy ? 'Updating…' : 'Save new fridge'}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Weight input — available in claimed and enroute state so
            the volunteer can enter the real weight the moment they
            handle the food (a kitchen scale, whatever). The
            restaurant estimate is a placeholder; the receipt uses
            what the volunteer confirms. */}
        {!pickup.destination_confirmation && !onHold && isClaimant && (pickup.status === 'claimed' || pickup.status === 'enroute') ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>
              Actual weight (lbs) <Text style={styles.optional}>· goes on the tax receipt</Text>
            </Text>
            <Input
              value={weight}
              onChangeText={setWeight}
              placeholder={`Estimate ${pickup.estimated_weight_lbs || 20} — override with the real number`}
              keyboardType="decimal-pad"
            />
          </View>
        ) : null}

        {/* Drop-off proof photo — optional at completion time.
            Blueprint values weighed-and-photo'd receipts. Uploaded
            immediately on capture so the completion write only needs
            the URL. #11 from drop-off audit. */}
        {!onHold && isClaimant && pickup.status === 'enroute' ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>
              Drop-off proof <Text style={styles.optional}>· optional, shown on the receipt</Text>
            </Text>
            {dropoffPhotoUri ? (
              <View style={styles.proofPhotoWrap}>
                <Image source={{ uri: dropoffPhotoUri }} style={styles.proofPhoto} resizeMode="cover" />
                {uploadingProof ? (
                  <View style={styles.proofOverlay}>
                    <ActivityIndicator color={Colors.white} />
                    <Text style={styles.proofOverlayText}>Uploading…</Text>
                  </View>
                ) : uploadedDropoffUrl ? (
                  <View style={styles.proofBadge}>
                    <Text style={styles.proofBadgeText}>✓ Attached</Text>
                  </View>
                ) : null}
                <TouchableOpacity onPress={handleAddDropoffPhoto} style={styles.proofRetake}>
                  <Text style={styles.proofRetakeText}>Retake</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.proofBtn} onPress={handleAddDropoffPhoto} activeOpacity={0.85}>
                <Icon name="camera" size={16} color={Colors.green} />
                <Text style={styles.proofBtnText}>Snap the food in the fridge</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : null}

        {cta && !onHold && !reviewing && !actionInTrip && (
          <Button title={cta.label} onPress={cta.onPress} loading={cta.loading} />
        )}

        {!onHold && isClaimant && ['claimed', 'enroute'].includes(pickup.status) && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Get help with this pickup</Text>
            <Text style={styles.sectionHelp}>Put the run on hold and contact your chapter coordinator.</Text>
            <View style={styles.problemRow}>
              <Button title="Can’t continue" variant="secondary" disabled={busy} onPress={() => handleHold('cannot_continue')} />
              <Button title="Food concern" variant="secondary" disabled={busy} onPress={() => handleHold('food_concern')} />
              <Button title="Drop-off unavailable" variant="secondary" disabled={busy} onPress={() => handleHold('destination_unavailable')} />
            </View>
          </View>
        )}

        {pickup.status === 'completed' ? (
          <View style={[styles.section, styles.doneCard]}>
            <Icon name="check-circle" size={28} color={Colors.green} />
            <Text style={styles.doneText}>Delivered — thank you.</Text>
            <Text style={styles.doneSub}>
              {pickup.actual_weight_lbs || pickup.estimated_weight_lbs || 0} lbs rescued ·
              {' '}{Math.round((pickup.actual_weight_lbs || pickup.estimated_weight_lbs || 0) * 1.2)} meal equivalents ·
              {' '}{pickup.hours_earned || 0}h logged
            </Text>
            {pickup.tax_receipt_url ? (
              <TouchableOpacity
                onPress={() => {
                  if (Platform.OS === 'web' && typeof window !== 'undefined') {
                    window.open(pickup.tax_receipt_url, '_blank', 'noopener,noreferrer');
                  }
                }}
                style={styles.receiptLink}
                activeOpacity={0.85}
              >
                <Text style={styles.receiptLinkText}>📄 View the tax receipt sent to the restaurant</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.doneSub}>Tax receipt is being generated for the restaurant…</Text>
            )}
            <TouchableOpacity
              onPress={goBackOrRescue}
              style={styles.doneBackBtn}
              activeOpacity={0.85}
            >
              <Text style={styles.doneBackText}>Back to dashboard</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Secondary action: release a claim. Only shown when the
            volunteer is currently the owner and hasn't started yet. */}
        {!onHold && !pickup.verified_by_restaurant_at && pickup.status === 'claimed' && isClaimant ? (
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
  rescueTitle: { fontSize: 32, fontWeight: '700', letterSpacing: -0.8, color: Colors.dark, marginBottom: 16 },
  rescueAction: { minHeight: 50, padding: 12, borderRadius: 14, alignItems: 'center',
    justifyContent: 'center', backgroundColor: Colors.green },
  rescueActionLabel: { color: Colors.white, fontSize: 16, fontWeight: '700' },
  reviewActions: { gap: 7, marginTop: 14 },
  reviewTime: { color: Colors.dark, fontWeight: '600', fontSize: 15 },
  reviewHint: { color: Colors.gray, fontSize: 14, lineHeight: 20, marginBottom: 4 },
  section: { marginTop: 22 },
  sectionLabel: { fontSize: 14, fontWeight: '700', color: Colors.dark, marginBottom: 6 },
  sectionHelp: { ...Type.caption, marginBottom: 12 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  linkBtn: { paddingVertical: 4, paddingHorizontal: 8 },
  linkBtnText: { color: Colors.green, fontSize: 13.5, fontWeight: '700' },
  saveFridgeBtn: {
    marginTop: 10, paddingVertical: 11, paddingHorizontal: 16,
    backgroundColor: Colors.green, borderRadius: 12, alignItems: 'center',
  },
  saveFridgeBtnText: { color: Colors.cream, fontSize: 14, fontWeight: '700' },

  // Drop-off proof photo
  proofBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center',
    paddingVertical: 14, paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1, borderColor: Colors.green + '33', borderStyle: 'dashed',
  },
  proofBtnText: { color: Colors.green, fontSize: 14, fontWeight: '700' },
  proofPhotoWrap: { position: 'relative', borderRadius: 12, overflow: 'hidden' },
  proofPhoto: { width: '100%', height: 180 },
  proofOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(26,31,46,0.55)',
    alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  proofOverlayText: { color: Colors.white, fontSize: 12, fontWeight: '600' },
  proofBadge: {
    position: 'absolute', top: 10, left: 10,
    backgroundColor: Colors.green,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
  },
  proofBadgeText: { color: Colors.cream, fontSize: 11, fontWeight: '800' },
  proofRetake: {
    position: 'absolute', top: 10, right: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
  },
  proofRetakeText: { color: Colors.white, fontSize: 12, fontWeight: '600' },

  // Something-wrong escape hatches
  problemRow: { gap: 8 },
  problemBtnHintDanger: { color: '#8E1B1B' },
  optional: { fontWeight: '500', color: Colors.gray },
  doneCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 16, marginTop: 18,
    backgroundColor: Colors.greenLight, borderRadius: Radius.lg,
  },
  doneText: { fontSize: 16, fontWeight: '800', color: Colors.green, marginTop: 8 },
  doneSub: { ...Type.caption, color: Colors.gray, marginTop: 4, textAlign: 'center' },
  receiptLink: {
    marginTop: 12, paddingVertical: 10, paddingHorizontal: 14,
    backgroundColor: '#E8F5EE', borderRadius: 10, alignItems: 'center',
    borderWidth: 1, borderColor: '#A7F3D0',
  },
  receiptLinkText: { color: '#065F46', fontWeight: '800', fontSize: 13 },
  doneBackBtn: {
    marginTop: 12, paddingVertical: 12, paddingHorizontal: 24,
    backgroundColor: Colors.green, borderRadius: 10,
  },
  doneBackText: { color: '#FFF', fontWeight: '800', fontSize: 14 },
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
    // flexWrap so on tiny phones the map buttons drop below the
    // address instead of overlapping the street text.
    flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 18, padding: 16,
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
