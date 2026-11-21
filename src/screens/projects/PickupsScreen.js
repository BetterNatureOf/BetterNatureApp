import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors, Type } from '../../config/theme';
import Icon from '../../components/ui/Icon';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Screen from '../../components/ui/Screen';
import usePickups from '../../hooks/usePickups';
import useResponsiveLayout from '../../hooks/useResponsiveLayout';
import RescueCellMap from '../../components/maps/RescueCellMap';
import { groupRescueCells, pickupDeadline, rescueCell, rescueOfferDeadline } from '../../services/rescueCells';
import useAuthStore from '../../store/authStore';
import { db } from '../../config/firebase';
import { deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { getCurrentPosition } from '../../services/maps';

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
        const cell = rescueCell(lat, lng, 7);
        if (!cell) throw new Error('Location is unavailable.');
        await setDoc(ref, { cell, updated_at: serverTimestamp() });
      }
    } catch {
      setError(stop ? 'Couldn’t stop nearby alerts. Try again.'
        : 'Couldn’t share your area. Check your location permission and try again.');
    } finally { setBusy(false); }
  }

  return (
    <Card>
      <Text style={styles.offerTitle}>Nearby rescue alerts</Text>
      <Text style={styles.caption}>{active
        ? 'Available for nearby rescues. Update your area if you move.'
        : 'Use your approximate area to get nearby rescue alerts for one hour.'}</Text>
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
  const [resolution, setResolution] = useState(8);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const available = useMemo(() => pickups.filter((p) =>
    p.status === 'available' && (rescueOfferDeadline(p) ?? 0) > now
  ).sort((a, b) => {
    const deadline = (pickup) => pickupDeadline(pickup.latest_safe_start_at) ?? rescueOfferDeadline(pickup);
    return deadline(a) - deadline(b);
  }), [pickups, now]);
  const cells = useMemo(() => groupRescueCells(available, resolution, now), [available, resolution, now]);
  const selectedCell = mode === 'Map' ? cells.find((cell) => cell.id === selected) : null;
  const unmapped = available.length - cells.reduce((count, cell) => count + cell.pickups.length, 0);
  const changeResolution = useCallback((value) => {
    setResolution(value);
    setSelected(null);
  }, []);
  const selectCell = useCallback((id) => setSelected((previous) => previous === id ? null : id), []);

  function changeMode(value) {
    setMode(value);
    setSelected(null);
    setResolution(8);
  }

  function renderPickup(pickup) {
    const by = pickupDeadline(pickup.latest_safe_start_at ?? pickup.destination_confirmation?.pickup_by ?? pickup.pickup_window_until);
    return (
      <Pressable key={pickup.id} accessibilityRole="button"
        onPress={() => navigation.navigate('PickupDetail', { pickupId: pickup.id, pickup })}
        style={({ pressed }) => [styles.offer, pressed && styles.offerPressed]}>
        <View style={styles.offerBody}>
          <Text style={styles.offerTitle}>{pickup.restaurant_name || 'Food partner'}</Text>
          <Text style={styles.caption}>Drop off at {pickup.fridge_name || 'a receiving site'}</Text>
          <Text style={styles.caption}>
            {pickup.estimated_weight_lbs ? `${pickup.estimated_weight_lbs} lb · ` : ''}
            {by ? `${pickup.latest_safe_start_at ? 'Start' : 'Pick up'} by ${new Date(by).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Pickup time unlisted'}
          </Text>
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
          {mode === 'Map' && cells.length > 0 ? (
            <RescueCellMap
              cells={cells}
              selected={selectedCell?.id}
              onSelect={selectCell}
              onResolution={changeResolution}
              summary={
                <Text style={styles.caption}>
                  {available.length - unmapped} on map · Select a zone to view routes
                </Text>
              }
            >
              {selectedCell?.pickups.map(renderPickup)}
            </RescueCellMap>
          ) : (
            <>
              {mode === 'Map' && available.length > 0 && (
                <Text style={styles.caption}>These pickups don’t have map locations yet. You can still review them here.</Text>
              )}
              {available.map(renderPickup)}
            </>
          )}
          {mode === 'Map' && cells.length > 0 && unmapped > 0 && (
            <Pressable accessibilityRole="button" onPress={() => changeMode('List')} style={styles.back}>
              <Text style={styles.backLabel}>{unmapped} without a map location · View list</Text>
            </Pressable>
          )}
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
});
