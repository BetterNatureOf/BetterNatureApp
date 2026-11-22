// Receiving partner home: availability for each site this account
// receives for, donations offered to them (accept / decline), and
// deliveries on the way. Accepting reserves capacity on the server and
// confirms the destination; volunteers are dispatched only after that.
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, TextInput } from 'react-native';
import { collection, onSnapshot, query, where, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { Colors, Type } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import ResponsiveContainer from '../../components/ui/ResponsiveContainer';
import Screen from '../../components/ui/Screen';
import Button from '../../components/ui/Button';
import useAuthStore from '../../store/authStore';
import { respondToPartnerRequest } from '../../services/database';
import { confirm, notify } from '../../services/ui';
import { describeSiteNow } from '../../services/receivingSiteText';
import { categoryOf } from '../../../functions/lib/rescueCargo';

const toMs = (v) => (v?.toMillis ? v.toMillis() : typeof v === 'string' ? Date.parse(v) : null);
const clock = (ms) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export default function PartnerIncoming({ navigation }) {
  const user = useAuthStore((s) => s.user);
  const [sites, setSites] = useState(null);
  const [requests, setRequests] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [minutes, setMinutes] = useState({});
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    if (!user?.id) return undefined;
    return onSnapshot(query(collection(db, 'receiving_sites'), where('receiver_uid', '==', user.id)),
      (snap) => setSites(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setSites([]));
  }, [user?.id]);
  const chapterId = sites?.[0]?.chapter_id || user?.chapter_id;
  useEffect(() => {
    if (!chapterId) return undefined;
    return onSnapshot(query(collection(db, 'pickups'), where('chapter_id', '==', chapterId),
      where('partner_request.status', '==', 'awaiting_partner')),
    (snap) => setRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setRequests([]));
  }, [chapterId]);
  useEffect(() => {
    if (!user?.id) return undefined;
    return onSnapshot(query(collection(db, 'pickups'), where('receiver_uid', '==', user.id),
      where('status', 'in', ['available', 'claimed', 'enroute'])),
    (snap) => setIncoming(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setIncoming([]));
  }, [user?.id]);

  const mySiteIds = new Set((sites || []).map((s) => s.id));
  const forMe = requests.filter((p) => (p.partner_request.mode === 'preferred' ? mySiteIds.has(p.partner_request.site_id) : mySiteIds.size > 0));

  const accept = useCallback(async (p) => {
    const site = p.partner_request.mode === 'preferred' ? sites.find((s) => s.id === p.partner_request.site_id) : sites.find((s) => s.status !== 'paused') || sites[0];
    const mins = parseInt(minutes[p.id] || '120', 10);
    if (!site || !(mins >= 15 && mins <= 1440)) { notify('Check the receiving time', 'Enter how many minutes from now you can receive until (15–1440).'); return; }
    const arrivalBy = Date.now() + mins * 60_000;
    if (!await confirm('Accept this donation?', `${site.name} will receive it by ${clock(arrivalBy)}. Capacity is reserved now, then a volunteer is found.`)) return;
    setBusy(p.id);
    try { await respondToPartnerRequest(p.id, { response: 'accept', siteId: site.id, arrivalBy }); }
    catch (e) { notify('Could not accept', e?.message || 'Try again.'); }
    finally { setBusy(null); }
  }, [minutes, sites]);

  const decline = useCallback(async (p) => {
    const reason = typeof window !== 'undefined' && window.prompt ? (window.prompt('What should the donor know? (optional)', '') || '') : '';
    setBusy(p.id);
    try { await respondToPartnerRequest(p.id, { response: 'decline', reason }); }
    catch (e) { notify('Could not decline', e?.message || 'Try again.'); }
    finally { setBusy(null); }
  }, []);

  const togglePause = useCallback(async (site) => {
    const pausing = site.status !== 'paused';
    try {
      await updateDoc(doc(db, 'receiving_sites', site.id), { status: pausing ? 'paused' : 'active',
        pause_reason: pausing ? 'Paused by receiving contact' : null, updated_at: serverTimestamp() });
    } catch (e) { notify('Could not update availability', e?.message || 'Try again.'); }
  }, []);

  return (
    <Screen contentStyle={styles.content}>
      <ResponsiveContainer maxWidth={720}>
        <TouchableOpacity onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('MainTabs', { screen: 'Dashboard' }))} accessibilityRole="button">
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
        <BrushText variant="screenTitle">Receiving</BrushText>
        {sites === null && <ActivityIndicator color={Colors.green} />}
        {sites?.length === 0 && <Text style={styles.empty}>Your account isn’t a receiving contact for any site yet. Ask your chapter coordinator to add you.</Text>}

        {sites?.map((site) => {
          const now = describeSiteNow(site);
          return (
            <View key={site.id} style={styles.card}>
              <View style={styles.rowBetween}>
                <Text style={styles.cardTitle}>{site.name}</Text>
                <Text style={[styles.badge, now.tone === 'warn' && styles.badgeWarn]}>{now.label}</Text>
              </View>
              <Text style={styles.meta}>{now.detail}</Text>
              <Button title={site.status === 'paused' ? 'Resume taking donations' : 'Pause donations'} variant="secondary" onPress={() => togglePause(site)} />
            </View>
          );
        })}

        {sites?.length > 0 && <Text style={styles.section}>Donations offered to you</Text>}
        {sites?.length > 0 && forMe.length === 0 && <Text style={styles.empty}>No open requests right now.</Text>}
        {forMe.map((p) => (
          <View key={p.id} style={styles.card}>
            <Text style={styles.cardTitle}>{p.restaurant_name || 'Donation'}</Text>
            <Text style={styles.meta}>
              {[categoryOf(p.food_category)?.label, p.estimated_weight_lbs ? `about ${p.estimated_weight_lbs} lb (estimate)` : null,
                p.packages ? `${p.packages} items` : null].filter(Boolean).join(' · ')}
            </Text>
            <Text style={styles.meta}>
              {p.partner_request.mode === 'preferred' ? 'Asked you specifically' : 'Offered to all partners'} · answer by {clock(toMs(p.partner_request.respond_by))}
              {p.pickup_window_until ? ` · ready until ${clock(toMs(p.pickup_window_until))}` : ''}
            </Text>
            {!!p.notes && <Text style={styles.meta}>“{p.notes}”</Text>}
            <Text style={styles.label}>You can receive until (minutes from now)</Text>
            <TextInput style={styles.input} value={minutes[p.id] ?? '120'} onChangeText={(v) => setMinutes((m) => ({ ...m, [p.id]: v.replace(/[^\d]/g, '') }))}
              keyboardType="number-pad" accessibilityLabel="Minutes from now you can receive until" />
            <View style={styles.actions}>
              <Button title="Accept" onPress={() => accept(p)} loading={busy === p.id} />
              <Button title="Decline" variant="secondary" onPress={() => decline(p)} disabled={busy === p.id} />
            </View>
          </View>
        ))}

        {sites?.length > 0 && <Text style={styles.section}>On the way to you</Text>}
        {sites?.length > 0 && incoming.length === 0 && <Text style={styles.empty}>No deliveries on the way.</Text>}
        {incoming.map((p) => (
          <TouchableOpacity key={p.id} style={styles.card} onPress={() => navigation.navigate('PickupDetail', { pickupId: p.id })} accessibilityRole="button">
            <Text style={styles.cardTitle}>{p.restaurant_name || 'Donation'}</Text>
            <Text style={styles.meta}>
              {p.status === 'available' ? 'Finding a volunteer' : p.status === 'claimed' ? `${p.claimant_name || 'Volunteer'} is heading to the donor` : `${p.claimant_name || 'Volunteer'} is on the way to you`}
              {p.destination_confirmation?.arrival_by ? ` · by ${clock(toMs(p.destination_confirmation.arrival_by))}` : ''}
            </Text>
            <Text style={styles.link}>Open to record what you receive →</Text>
          </TouchableOpacity>
        ))}
      </ResponsiveContainer>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 12, paddingBottom: 40, paddingHorizontal: 20 },
  back: { color: Colors.green, fontSize: 15, fontWeight: '600', paddingVertical: 8 },
  section: { fontSize: 17, fontWeight: '700', color: Colors.dark, marginTop: 18, marginBottom: 8 },
  card: { backgroundColor: Colors.white, borderRadius: 14, borderWidth: 1, borderColor: Colors.grayLight, padding: 14, marginBottom: 12, gap: 6 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: Colors.dark, flexShrink: 1 },
  badge: { fontSize: 12, fontWeight: '700', color: Colors.green, backgroundColor: Colors.greenLight, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, overflow: 'hidden' },
  badgeWarn: { color: '#7A4E0E', backgroundColor: Colors.amberLight },
  meta: { fontSize: 13, color: Colors.gray, lineHeight: 18 },
  label: { fontSize: 14, fontWeight: '700', color: Colors.dark, marginTop: 6 },
  input: { borderWidth: 1, borderColor: Colors.grayLight, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, minHeight: 46, color: Colors.dark },
  actions: { flexDirection: 'row', gap: 10, marginTop: 6, flexWrap: 'wrap' },
  empty: { ...Type.body, color: Colors.gray, marginBottom: 8 },
  link: { fontSize: 14, color: Colors.green, fontWeight: '700' },
});
