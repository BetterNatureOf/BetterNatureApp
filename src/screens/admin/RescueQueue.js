// One queue for every rescue that needs a coordinator: held runs,
// turned-away food, escalations, late volunteers, offers about to close,
// offers without a receiving site, and pending confirmations. Each row
// says who owns the next step, what it is, and the deadline that matters.
// Actions open the rescue (where the real service calls live) or, for a
// no-show, release the claim through releaseAbandonedPickup.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { collection, doc, getDoc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { Colors, Type } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import { BrandHero, BrandSheet } from '../../components/ui/BrandHero';
import ResponsiveContainer from '../../components/ui/ResponsiveContainer';
import Screen from '../../components/ui/Screen';
import Button from '../../components/ui/Button';
import useAuthStore from '../../store/authStore';
import { releaseAbandonedPickup } from '../../services/database';
import { confirm, notify } from '../../services/ui';
import { buildQueue } from '../../../functions/lib/rescueQueue';

const KIND_LABEL = {
  held: 'On hold', remainder_pending: 'Food turned away', escalated: 'Needs a decision', legacy_destination: 'No saved site', late_pickup: 'Late',
  late_delivery: 'Late', near_deadline: 'Closing soon', awaiting_site: 'No receiving site', awaiting_partner: 'Awaiting partner', awaiting_receipt: 'Awaiting receipt',
  awaiting_donor: 'Awaiting donor',
};
const URGENT = new Set(['held', 'remainder_pending', 'escalated', 'late_pickup', 'late_delivery']);

function timeLeft(minutes) {
  if (minutes == null) return null;
  if (minutes < 0) return `${Math.abs(minutes)} min overdue`;
  if (minutes < 60) return `${minutes} min left`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min left`;
}

export default function RescueQueue({ navigation }) {
  const user = useAuthStore((s) => s.user);
  const chapterId = user?.chapter_id;
  const [pickups, setPickups] = useState(null);
  const [dispatch, setDispatch] = useState({});
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    if (!chapterId) return undefined;
    const q = query(collection(db, 'pickups'), where('chapter_id', '==', chapterId),
      where('status', 'in', ['pending_destination', 'available', 'claimed', 'enroute']));
    return onSnapshot(q, (snap) => { setPickups(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); setError(''); },
      () => setError('Couldn’t load rescues. Check your connection.'));
  }, [chapterId]);

  // Dispatch state for open offers (escalations, rounds).
  const openIds = useMemo(() => (pickups || []).filter((p) => p.status === 'available').map((p) => p.id).sort().join(','), [pickups]);
  useEffect(() => {
    let alive = true;
    const ids = openIds ? openIds.split(',') : [];
    Promise.all(ids.map(async (id) => {
      try { const s = await getDoc(doc(db, 'pickups', id, 'dispatch', 'state')); return [id, s.exists() ? s.data() : null]; }
      catch { return [id, null]; }
    })).then((rows) => alive && setDispatch(Object.fromEntries(rows)));
    return () => { alive = false; };
  }, [openIds, now]);

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(t); }, []);

  const queue = useMemo(() => (pickups ? buildQueue(pickups.map((p) => ({ ...p, dispatch: dispatch[p.id] })), now) : null),
    [pickups, dispatch, now]);

  const releaseNoShow = useCallback(async (item) => {
    if (!await confirm('Release this claim?', 'Use this when the volunteer is a no-show and the donor still has the food. The offer reopens (or closes if its window passed) and the volunteer is told. No penalty.')) return;
    setBusyId(item.id);
    try { await releaseAbandonedPickup(item.id, { reason: 'coordinator_no_show' }); }
    catch (e) { notify('Could not release the claim', e?.message || 'Try again.'); }
    finally { setBusyId(null); }
  }, []);

  return (
    <Screen contentStyle={{ padding: 0 }}>
      <BrandHero kicker="Coordinator" title="Rescue queue" subtitle="Everything that needs a decision, most urgent first. Updates live."
        onBack={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('MainTabs', { screen: 'Dashboard' }))}
        stats={queue ? [
          { value: queue.items.filter((i) => URGENT.has(i.kind)).length, label: 'need you now', tone: queue.items.some((i) => URGENT.has(i.kind)) ? 'alert' : undefined },
          { value: queue.items.length, label: 'in the queue' },
          { value: queue.healthy, label: 'on schedule' },
        ] : []} />
      <BrandSheet>
      <ResponsiveContainer maxWidth={720}>
        {!chapterId && <Text style={styles.empty}>Your account isn’t linked to a chapter.</Text>}
        {!!error && <Text style={styles.error}>{error}</Text>}
        {queue === null && !!chapterId && !error && <ActivityIndicator color={Colors.green} />}
        {queue && queue.items.length === 0 && (
          <Text style={styles.empty}>Nothing needs you right now. {queue.healthy ? `${queue.healthy} rescue${queue.healthy === 1 ? ' is' : 's are'} moving on schedule.` : ''}</Text>
        )}
        {queue?.items.map((item) => (
          <View key={item.id} style={[styles.card, URGENT.has(item.kind) && styles.cardUrgent]} accessibilityRole="summary">
            <View style={styles.rowBetween}>
              <Text style={[styles.badge, URGENT.has(item.kind) && styles.badgeUrgent]}>{KIND_LABEL[item.kind]}</Text>
              {item.minutesLeft != null && (
                <Text style={[styles.time, item.minutesLeft < 0 && styles.timeLate]}>
                  {item.deadlineLabel} · {timeLeft(item.minutesLeft)}
                </Text>
              )}
            </View>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.meta}>{item.restaurant} · Next step owner: {item.owner}</Text>
            <Text style={styles.next}>Next: {item.next}</Text>
            <View style={styles.actions}>
              <Button title="Open rescue" variant="secondary"
                onPress={() => navigation.navigate('PickupDetail', { pickupId: item.id })} />
              {item.kind === 'late_pickup' && !(pickups.find((p) => p.id === item.id)?.verified_by_restaurant_at) && (
                <Button title="Release no-show" variant="secondary" loading={busyId === item.id} onPress={() => releaseNoShow(item)} />
              )}
            </View>
          </View>
        ))}
        {queue && queue.items.length > 0 && queue.healthy > 0 && (
          <Text style={styles.footer}>{queue.healthy} other rescue{queue.healthy === 1 ? ' is' : 's are'} on schedule.</Text>
        )}
      </ResponsiveContainer>
      </BrandSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 12, paddingBottom: 40, paddingHorizontal: 20 },
  back: { color: Colors.green, fontSize: 15, fontWeight: '600', paddingVertical: 8 },
  subtitle: { ...Type.body, color: Colors.gray, marginTop: 6, marginBottom: 16 },
  card: { backgroundColor: Colors.white, borderRadius: 20, borderWidth: 1, borderColor: '#E7EBE6', padding: 16, marginBottom: 12, gap: 4,
    shadowColor: '#0B2A20', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  cardUrgent: { borderColor: Colors.pink, borderLeftWidth: 4 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  badge: { fontSize: 12, fontWeight: '700', color: Colors.green, backgroundColor: Colors.greenLight, borderRadius: 999,
    paddingHorizontal: 10, paddingVertical: 4, overflow: 'hidden' },
  badgeUrgent: { color: '#7A4E0E', backgroundColor: Colors.amberLight },
  time: { fontSize: 13, color: Colors.gray, fontWeight: '600' },
  timeLate: { color: '#9B2C2C' },
  title: { fontSize: 16, fontWeight: '700', color: Colors.dark, marginTop: 8 },
  meta: { fontSize: 13, color: Colors.gray, marginTop: 4 },
  next: { fontSize: 14, color: Colors.dark, marginTop: 6, lineHeight: 20 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12, flexWrap: 'wrap' },
  empty: { fontSize: 15, color: Colors.gray, marginTop: 8 },
  error: { fontSize: 14, color: '#9B2C2C', marginBottom: 12 },
  footer: { fontSize: 13, color: Colors.gray, marginTop: 4 },
});
