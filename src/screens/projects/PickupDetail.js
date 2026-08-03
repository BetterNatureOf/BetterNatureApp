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
import PickupTimeline from '../../components/pickup/PickupTimeline';
import PickupContacts from '../../components/pickup/PickupContacts';
import PickupCountdown from '../../components/pickup/PickupCountdown';
import FridgePicker from '../../components/ui/FridgePicker';
import AnimatedPressable from '../../components/ui/AnimatedPressable';
import Icon from '../../components/ui/Icon';
import useAuthStore from '../../store/authStore';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { claimPickup, setPickupEnroute, completePickup, cancelClaim, verifyPickupByRestaurant, updatePickupFridge, handOffPickup, reportPickupSpoiled } from '../../services/database';
import { uploadPickupPhoto } from '../../services/pickupPhotos';
import * as ImagePicker from 'expo-image-picker';
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

  // Re-pull whenever the pickupId in params changes. Previously this
  // only ran once on mount, so opening a second pickup from the
  // dashboard kept showing the first one (or got stuck on the
  // spinner if the initial route had no pickup payload).
  useEffect(() => {
    if (!pickupId) {
      setLoadError('No pickup id was passed to this screen.');
      return;
    }
    let alive = true;
    setLoadError(null);
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'pickups', pickupId));
        if (!alive) return;
        if (snap.exists()) {
          setPickup({ id: snap.id, ...snap.data() });
        } else {
          setLoadError("Couldn't find this pickup — it may have been deleted.");
        }
      } catch (e) {
        console.warn('pickup load', e);
        if (alive) setLoadError(e?.message || 'Failed to load this pickup.');
      }
    })();
    return () => { alive = false; };
  }, [pickupId]);

  if (loadError) {
    return (
      <View style={styles.loading}>
        <Text style={{ color: Colors.dark, textAlign: 'center', padding: 24 }}>
          {loadError}
        </Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 12 }}>
          <Text style={{ color: Colors.green, fontWeight: '700' }}>‹ Back</Text>
        </TouchableOpacity>
      </View>
    );
  }
  if (!pickup) {
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
      'It goes back on the board for another volunteer. This costs 5 leaderboard points and gets logged as a drop. Only do this if you truly can\'t make the run.'
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
      await cancelClaim(pickup.id, reason.trim() || undefined);
      notifyThen('Released', 'Thanks for letting us know. The pickup is open again.', () => navigation.goBack());
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

  // #5 from drop-off audit — volunteer's car broke down, they got
  // called into work, whatever. Food is in the trunk, no way to
  // deliver. cancelClaim refuses if enroute; handOff releases the
  // pickup with a "someone else needs to physically meet me" flag
  // so the next claimant knows.
  async function handleHandOff() {
    const ok = await confirm(
      'Hand off this pickup?',
      "Only pick this if you physically can't finish the run. The pickup goes back on the board with your contact info so the next volunteer can meet you to grab the food. No leaderboard penalty."
    );
    if (!ok) return;
    let reason = '';
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      reason = window.prompt('What happened? (one sentence — helps the next volunteer)', '') || '';
    }
    setBusy(true);
    try {
      await handOffPickup(pickup.id, reason.trim() || undefined);
      notifyThen('Handed off', 'Someone else can claim it now. Coordinate with them via the app.', () => navigation.goBack());
    } catch (e) {
      notify('Could not hand off', e?.message || 'Try again.');
    } finally { setBusy(false); }
  }

  // #6 from drop-off audit — three sub-cases:
  //   fridge_full   → volunteer tried to change fridge, no others work
  //   fridge_broken → destination fridge is offline / damaged
  //   food_spoiled  → food went bad in transit
  // All three mark the pickup 'completed' but with spoiled === true,
  // which skips receipt minting + stat bumps. Restaurant gets a
  // candid "no receipt is coming, here's why" notification.
  async function handleReportSpoiled() {
    // Simple picker via web prompt / native alert. Not the polished
    // modal — that lands with the Approval Inbox in Phase 2 when
    // execs also review these reports for chapter operations.
    const kinds = [
      { key: 'food_spoiled',  label: 'Food spoiled in transit' },
      { key: 'fridge_full',   label: 'Fridge was full, no alternate' },
      { key: 'fridge_broken', label: 'Fridge was broken / offline' },
    ];
    const picks = kinds.map((k, i) => `${i + 1}. ${k.label}`).join('\n');
    let chosen = null;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const raw = window.prompt(`Report a problem — enter 1, 2, or 3:\n\n${picks}`, '1');
      const idx = parseInt((raw || '').trim(), 10) - 1;
      chosen = kinds[idx] || null;
    } else {
      // Native — default to food_spoiled with a single confirm.
      const ok = await confirm(
        'Report as spoiled?',
        'Marks the pickup complete but skips the tax receipt. Restaurant gets notified. Use this only when the food genuinely didn\'t make it to a fridge.'
      );
      chosen = ok ? kinds[0] : null;
    }
    if (!chosen) return;
    let note = '';
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      note = window.prompt('Add a note for the restaurant (optional):', '') || '';
    }
    setBusy(true);
    try {
      await reportPickupSpoiled(pickup.id, { kind: chosen.key, note: note.trim() || undefined });
      notifyThen('Reported', 'The restaurant has been notified. No tax receipt was issued.', () => navigation.goBack());
    } catch (e) {
      notify('Could not report', e?.message || 'Try again.');
    } finally { setBusy(false); }
  }

  async function handleDelivered() {
    // Client-side weight check — required now (service enforces too).
    const w = weight ? parseFloat(weight) : NaN;
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
        notify(
          'Restaurant needs to confirm first',
          "You can only mark delivered after the restaurant confirms you picked up the food. Ask them to open their app and tap 'Confirm pickup happened.'"
        );
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

        {/* Countdown — remaining time in the restaurant's window.
            Renders on every state (preview, claimed, enroute) so
            volunteers see urgency BEFORE they claim too. */}
        <PickupCountdown pickup={pickup} style={{ marginBottom: 12 }} />

        {/* Timeline — shows where in the flow this run is at a
            glance, on both restaurant and volunteer views. Only
            once the pickup is past 'available' — a preview card
            doesn't need the ladder. */}
        {pickup.status !== 'available' ? <PickupTimeline pickup={pickup} /> : null}

        {/* Contact cards. Restaurant sees the volunteer's phone
            once claimed; volunteer sees the restaurant's phone
            once claimed. Both sides can call/text the moment
            something goes sideways at the door. */}
        {pickup.status !== 'available' && pickup.status !== 'completed' && pickup.status !== 'cancelled' ? (
          userIsRestaurant
            ? <PickupContacts pickup={pickup} side="restaurant" />
            : <PickupContacts pickup={pickup} side="volunteer" />
        ) : null}

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
        {/* Volunteer-side milestone — once the restaurant confirms,
            the volunteer sees a clear "half-way" banner so they know
            the handoff is proven and only the drop remains. */}
        {!userIsRestaurant && pickup.verified_by_restaurant_at && pickup.status !== 'completed' ? (
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
        {!userIsRestaurant && pickup.status === 'enroute' ? (
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
        {!userIsRestaurant && (pickup.status === 'claimed' || pickup.status === 'enroute') ? (
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
        {!userIsRestaurant && pickup.status === 'enroute' ? (
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

        {/* Something-wrong escape hatches — visible while enroute so
            a volunteer whose run went sideways doesn't have to fake
            a completion. Hand off gets the food to another volunteer;
            Report spoiled closes the pickup honestly (no receipt, no
            hours). #5 + #6 from drop-off audit. */}
        {!userIsRestaurant && pickup.status === 'enroute' ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>
              Something not going right?
            </Text>
            <Text style={styles.sectionHelp}>
              Use these only if you can't finish the run — the restaurant sees each one.
            </Text>
            <View style={styles.problemRow}>
              <TouchableOpacity style={styles.problemBtn} onPress={handleHandOff} activeOpacity={0.85}>
                <Text style={styles.problemBtnText}>Hand off to another volunteer</Text>
                <Text style={styles.problemBtnHint}>No leaderboard penalty — food just goes back on the board.</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.problemBtn, styles.problemBtnDanger]} onPress={handleReportSpoiled} activeOpacity={0.85}>
                <Text style={[styles.problemBtnText, styles.problemBtnTextDanger]}>Report spoiled / fridge problem</Text>
                <Text style={[styles.problemBtnHint, styles.problemBtnHintDanger]}>No tax receipt issued. Restaurant is told what happened.</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

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
              onPress={() => navigation.goBack()}
              style={styles.doneBackBtn}
              activeOpacity={0.85}
            >
              <Text style={styles.doneBackText}>Back to dashboard</Text>
            </TouchableOpacity>
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
  problemBtn: {
    paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1, borderColor: Colors.glassBorder,
    backgroundColor: Colors.white,
  },
  problemBtnDanger: {
    borderColor: '#F5B5B5',
    backgroundColor: '#FCE3E3',
  },
  problemBtnText: { fontSize: 14, fontWeight: '700', color: Colors.dark },
  problemBtnTextDanger: { color: '#8E1B1B' },
  problemBtnHint: { fontSize: 12, color: Colors.gray, marginTop: 4, lineHeight: 17 },
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
