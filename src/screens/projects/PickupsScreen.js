import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors, Type } from '../../config/theme';
import Icon from '../../components/ui/Icon';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Screen from '../../components/ui/Screen';
import usePickups from '../../hooks/usePickups';
import useResponsiveLayout from '../../hooks/useResponsiveLayout';
import RescueMap from '../../components/maps/RescueMap';
import { pickupDeadline, rescueCell, rescueOfferDeadline } from '../../services/rescueCells';
import useAuthStore from '../../store/authStore';
import { db } from '../../config/firebase';
import { collectionGroup, deleteDoc, doc, onSnapshot, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { getCurrentPosition } from '../../services/maps';

const clock = (ms) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const CLOSING_SOON_MS = 30 * 60_000;

// Shares only an approximate area (an H3 cell about 5 km² across), never
// a precise position. Used for nearby offers for one hour.
async function shareArea(uid, lat, lng) {
  const cell = rescueCell(lat, lng, 7);
  if (!cell) throw new Error('Location is unavailable.');
  await setDoc(doc(db, 'rescue_availability', uid), { cell, updated_at: serverTimestamp() });
}

// The volunteer's live offers across rescues (server-owned).
function useMyOffers(uid, now) {
  const [offers, setOffers] = useState([]);
  useEffect(() => {
    if (!uid || !db) return undefined;
    return onSnapshot(query(collectionGroup(db, 'offers'), where('uid', '==', uid), where('status', '==', 'open')),
      (snap) => setOffers(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setOffers([]));
  }, [uid]);
  return offers.filter((o) => (pickupDeadline(o.expires_at) ?? 0) > now);
}

function NearbyRescues({ uid, now }) {
  const [availability, setAvailability] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => onSnapshot(doc(db, 'rescue_availability', uid), (snapshot) => {
    setAvailability(snapshot.data() ?? {});
  }, () => setError('Couldn’t load your availability.')), [uid]);

  const updated = pickupDeadline(availability?.updated_at);
  const active = updated !== null && updated + 60 * 60_000 > now;

  async function changeAvailability(stop) {
    setBusy(true);
    setError('');
    const ref = doc(db, 'rescue_availability', uid);
    try {
      if (stop) {
        await deleteDoc(ref);
      } else {
        const { lat, lng } = await getCurrentPosition({ maximumAge: 0 });
        await shareArea(uid, lat, lng);
      }
    } catch {
      setError(stop ? 'Couldn’t stop nearby alerts. Try again.'
        : 'Couldn’t use your location. Allow location, or move the map and choose “Use map center as my area”.');
    } finally { setBusy(false); }
  }

  return (
    <Card>
      <Text style={styles.offerTitle}>Nearby rescue offers</Text>
      <Text style={styles.caption}>{active
        ? 'You can get offers for the next hour. We use your approximate area (about 2 km across), never your exact location.'
        : 'Share your approximate area for one hour to get offers you can actually make in time.'}</Text>
      {!!error && <Text accessibilityRole="alert" style={styles.caption}>{error}</Text>}
      <Button variant="secondary" title={active ? 'Update my area' : 'Turn on nearby alerts'}
        loading={busy} disabled={availability === null} onPress={() => changeAvailability(false)} />
      {availability?.cell && <Button variant="secondary" title="Stop sharing my area" disabled={busy}
        onPress={() => changeAvailability(true)} />}
    </Card>
  );
}

export default function PickupsScreen({ navigation, inTab = false }) {
  const { contentStyle } = useResponsiveLayout();
  const { pickups, loading, error, loadPickups } = usePickups();
  const user = useAuthStore((s) => s.user);
  const active = pickups.filter((p) => p.claimed_by === user?.id && ['claimed', 'enroute'].includes(p.status));
  const [mode, setMode] = useState('Map');
  const [selected, setSelected] = useState(null);
  const [areaNote, setAreaNote] = useState('');
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  // Only rescues a volunteer can actually take: a saved receiving site is
  // confirmed (older typed-in destinations wait in the coordinator queue).
  const available = useMemo(() => pickups.filter((p) =>
    p.status === 'available' && !!p.destination_confirmation?.site_id && (rescueOfferDeadline(p) ?? 0) > now
  ).sort((a, b) => {
    const deadline = (pickup) => pickupDeadline(pickup.latest_safe_start_at) ?? rescueOfferDeadline(pickup);
    return deadline(a) - deadline(b);
  }), [pickups, now]);
  const myOffers = useMyOffers(user?.id, now);
  const offeredToMe = useMemo(() => new Map(myOffers.map((o) => [o.pickup_id, o])), [myOffers]);
  // Map and list show the same rescues: the map only places those with a
  // donor location; the rest are named in a note and are in the list.
  const points = useMemo(() => available.filter((p) => Number.isFinite(p.restaurant_lat) && Number.isFinite(p.restaurant_lng))
    .map((p) => ({ id: p.id, lat: p.restaurant_lat, lng: p.restaurant_lng, label: p.restaurant_name || 'Food partner',
      soon: (rescueOfferDeadline(p) ?? Infinity) - now <= CLOSING_SOON_MS })), [available, now]);
  const unmapped = available.length - points.length;
  // Keep the selection while data updates; drop it only if that rescue is gone.
  useEffect(() => { if (selected && !available.some((p) => p.id === selected)) setSelected(null); }, [available, selected]);
  const selectedPickup = available.find((p) => p.id === selected) || null;
  const selectPoint = useCallback((id) => setSelected((previous) => previous === id ? null : id), []);
  const pickArea = useCallback(async (lat, lng) => {
    setAreaNote('');
    try { await shareArea(user.id, lat, lng); setAreaNote('Area set for the next hour. Offers will use it.'); }
    catch { setAreaNote('Couldn’t save that area. Try again.'); }
  }, [user?.id]);

  function changeMode(value) {
    setMode(value);
  }

  function offerLine(pickup) {
    const mine = offeredToMe.get(pickup.id);
    if (mine) return `Offered to you · respond by ${clock(pickupDeadline(mine.expires_at))}`;
    const hold = pickupDeadline(pickup.offer_hold?.expires_at);
    if (hold && hold > now) return `Offered to another volunteer until ${clock(hold)} · it may come to you next`;
    return null;
  }

  function renderPickup(pickup) {
    const by = pickupDeadline(pickup.latest_safe_start_at ?? pickup.destination_confirmation?.pickup_by ?? pickup.pickup_window_until);
    const line = offerLine(pickup);
    return (
      <Pressable key={pickup.id} accessibilityRole="button"
        onPress={() => navigation.navigate('PickupDetail', { pickupId: pickup.id, pickup })}
        style={({ pressed }) => [styles.offer, pressed && styles.offerPressed]}>
        <View style={styles.offerBody}>
          <Text style={styles.offerTitle}>{pickup.restaurant_name || 'Food partner'}</Text>
          <Text style={styles.caption}>Drop off at {pickup.fridge_name || 'a receiving site'}</Text>
          <Text style={styles.caption}>
            {pickup.estimated_weight_lbs ? `${pickup.estimated_weight_lbs} lb · ` : ''}
            {by ? `${pickup.latest_safe_start_at ? 'Start' : 'Pick up'} by ${clock(by)}` : 'Pickup time unlisted'}
          </Text>
          {!!line && <Text style={[styles.caption, offeredToMe.has(pickup.id) && styles.offerMine]}>{line}</Text>}
        </View>
        <Icon name="chevron" color={Colors.green} size={18} />
      </Pressable>
    );
  }

  return (
    <Screen
      webHeight={inTab ? '100%' : undefined}
      contentStyle={Platform.OS === 'web' ? { ...contentStyle, paddingTop: 12, paddingInline: 16 } : contentStyle}
    >
      {!inTab && (
        <Pressable
          accessibilityRole="button"
          style={styles.back}
          onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('MainTabs')}
        >
          <Text style={styles.backLabel}>‹  Back</Text>
        </Pressable>
      )}
      <Text accessibilityRole="header" style={styles.title}>Food pickups</Text>
      {!loading && available.length > 0 && <Text style={styles.count}>{available.length} available in your chapter</Text>}

      {myOffers.map((o) => (
        <Pressable key={o.id} accessibilityRole="button" onPress={() => navigation.navigate('PickupDetail', { pickupId: o.pickup_id })}
          style={styles.offerBanner}>
          <Icon name="truck" color={Colors.white} size={20} />
          <View style={{ flex: 1 }}>
            <Text style={styles.offerBannerTitle}>A rescue is offered to you</Text>
            <Text style={styles.offerBannerBody}>Respond by {clock(pickupDeadline(o.expires_at))} · review the stops and timing</Text>
          </View>
          <Icon name="chevron" color={Colors.white} size={18} />
        </Pressable>
      ))}
      {loading && <ActivityIndicator color={Colors.green} accessibilityLabel="Loading pickups" />}
      {active.map((pickup) => (
        <Pressable
          key={pickup.id}
          accessibilityRole="button"
          onPress={() => navigation.navigate('PickupDetail', { pickupId: pickup.id, pickup })}
          style={styles.activeRun}
        >
          <Icon name="truck" color={Colors.green} size={22} />
          <View style={{ flex: 1 }}>
            <Text style={styles.offerTitle}>{pickup.safety_hold ? 'Pickup on hold' : 'Resume pickup'}</Text>
            <Text style={styles.caption}>
              {pickup.verified_by_restaurant_at
                ? pickup.fridge_name || 'Drop-off'
                : pickup.restaurant_name || 'Food partner'}
            </Text>
          </View>
          <Icon name="chevron" color={Colors.green} size={18} />
        </Pressable>
      ))}
      {error && (
        <Card>
          <Text style={Type.body}>Some pickups couldn’t load.</Text>
          <Button title="Try again" onPress={loadPickups} />
        </Card>
      )}
      {!loading && (
        <View style={{ gap: 12 }}>
          {available.length > 0 && (
            <View style={styles.segmented}>
              {['List', 'Map'].map((value) => (
                <Pressable
                  key={value}
                  accessibilityRole="button"
                  accessibilityState={{ selected: mode === value }}
                  onPress={() => changeMode(value)}
                  style={[styles.segment, mode === value && styles.segmentSelected]}
                >
                  <Text style={styles.segmentLabel}>{value}</Text>
                </Pressable>
              ))}
            </View>
          )}
          {mode === 'Map' && available.length > 0 && (
            <RescueMap mode="browse" points={points} selectedId={selected} onSelect={selectPoint}
              onPickArea={Platform.OS === 'web' && user?.id && user?.chapter_id ? pickArea : undefined}>
              {selectedPickup && (
                <View style={styles.sheet} accessibilityRole="summary">
                  <View style={styles.sheetTop}>
                    <Text style={styles.sheetTitle} numberOfLines={1}>Selected pickup</Text>
                    <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setSelected(null)} style={styles.sheetClose}>
                      <Text style={styles.sheetCloseText}>×</Text>
                    </Pressable>
                  </View>
                  {renderPickup(selectedPickup)}
                </View>
              )}
            </RescueMap>
          )}
          {mode === 'Map' && !!areaNote && <Text accessibilityRole="alert" style={styles.caption}>{areaNote}</Text>}
          {mode === 'Map' && available.length > 0 && !selectedPickup && (
            <Text style={styles.caption}>{points.length} on the map · tap a dot to see it{unmapped > 0 ? ` · ${unmapped} without a map location` : ''}</Text>
          )}
          {mode === 'Map' && unmapped > 0 && (
            <Pressable accessibilityRole="button" onPress={() => changeMode('List')} style={styles.back}>
              <Text style={styles.backLabel}>{unmapped} without a map location · View list</Text>
            </Pressable>
          )}
          {mode === 'List' && available.map(renderPickup)}
          {!user?.chapter_id ? (
            <Card>
              <Text style={Type.body}>Join a chapter to see pickups near you.</Text>
              <Button title="Find a chapter" onPress={() => navigation.navigate('FindChapter')} />
            </Card>
          ) : available.length === 0 && !error ? (
            <Card><Text style={Type.body}>No pickups are available in your chapter right now.</Text></Card>
          ) : null}
        </View>
      )}
      {!loading && !error && user?.chapter_id ? (
        <Button title="Refresh pickups" variant="secondary" onPress={loadPickups} />
      ) : null}
      {Platform.OS === 'web' && db && user?.id && user?.chapter_id &&
        <NearbyRescues key={user.id} uid={user.id} now={now} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  activeRun: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, minHeight: 60, borderRadius: 16, backgroundColor: Colors.greenLight },
  back: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  backLabel: { color: Colors.green, fontWeight: '600', fontSize: 16 },
  title: { fontSize: 34, lineHeight: 40, letterSpacing: -1.1, fontWeight: '700', color: Colors.dark },
  count: { fontSize: 15, color: Colors.gray, marginBottom: 12 },
  segmented: { flexDirection: 'row', backgroundColor: Colors.greenLight, borderRadius: 14, padding: 4 },
  segment: { flex: 1, minHeight: 44, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  segmentSelected: { backgroundColor: Colors.cream, shadowColor: Colors.dark, shadowOpacity: 0.10, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  segmentLabel: { color: Colors.green, fontSize: 15, fontWeight: '700' },
  offer: { flexDirection: 'row', alignItems: 'center', minHeight: 64, paddingVertical: 12, gap: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.greenLight },
  offerBody: { flex: 1, gap: 3 },
  offerPressed: { backgroundColor: Colors.greenLight },
  offerTitle: { fontSize: 16, fontWeight: '700', color: Colors.dark },
  caption: { color: Colors.gray, fontSize: 13, lineHeight: 19 },
  offerMine: { color: Colors.green, fontWeight: '700' },
  offerBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, minHeight: 60, borderRadius: 16, backgroundColor: Colors.green, marginBottom: 10 },
  offerBannerTitle: { color: Colors.white, fontSize: 16, fontWeight: '700' },
  offerBannerBody: { color: '#E6F0EC', fontSize: 13, lineHeight: 18 },
  sheet: { position: 'absolute', left: 12, right: 12, bottom: 30, zIndex: 700, backgroundColor: Colors.cream, borderRadius: 20,
    paddingHorizontal: 14, paddingTop: 10, shadowColor: '#20392E', shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  sheetTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontSize: 13, fontWeight: '700', color: Colors.gray, textTransform: 'uppercase', letterSpacing: 0.4, flexShrink: 1 },
  sheetClose: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  sheetCloseText: { fontSize: 24, color: Colors.green },
});
