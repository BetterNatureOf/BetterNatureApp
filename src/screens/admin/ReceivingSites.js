// Chapter coordinators manage where rescued food can go: staffed
// centers, steward-managed fridges and outreach partners. Hours, pause,
// accepted food and daily capacity feed confirmRescueDestination.
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Colors, Type } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import ResponsiveContainer from '../../components/ui/ResponsiveContainer';
import Screen from '../../components/ui/Screen';
import Button from '../../components/ui/Button';
import useAuthStore from '../../store/authStore';
import { listReceivingSites, saveReceivingSite } from '../../services/database';
import { notify } from '../../services/ui';
import { FOOD_CATEGORIES } from '../../../functions/lib/rescueCargo';
import { describeSiteNow, SITE_TYPES, DAY_KEYS } from '../../services/receivingSiteText';

const blank = { name: '', type: 'staffed_center', address: '', days: ['mon', 'tue', 'wed', 'thu', 'fri'], open: '09:00', close: '17:00',
  foods: [], packages: '', weight: '', contactName: '', contactPhone: '', storage: [], closures: '' };
const STORAGE = [['ambient', 'Shelf'], ['refrigerated', 'Refrigerated'], ['frozen', 'Frozen'], ['hot_holding', 'Hot holding']];
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

function toForm(site) {
  const days = DAY_KEYS.filter((d) => site.hours?.[d]?.length);
  const first = days.length ? site.hours[days[0]][0] : { open: '', close: '' };
  return { name: site.name || '', type: site.type, address: site.address || '', days, open: first.open, close: first.close,
    foods: site.food_categories || [], packages: site.capacity?.packages_per_day ? String(site.capacity.packages_per_day) : '',
    weight: site.capacity?.weight_lbs_per_day ? String(site.capacity.weight_lbs_per_day) : '',
    contactName: site.contacts?.[0]?.name || '', contactPhone: site.contacts?.[0]?.phone || '',
    storage: site.storage || [], closures: (site.closures || []).map((c) => c.date).join(', ') };
}

export default function ReceivingSites({ navigation }) {
  const user = useAuthStore((s) => s.user);
  const chapterId = user?.chapter_id;
  const [sites, setSites] = useState(null);
  const [editing, setEditing] = useState(null);   // null | 'new' | siteId
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try { setSites(await listReceivingSites(chapterId)); }
    catch (e) { setError(e?.message || 'Could not load receiving sites.'); setSites([]); }
  }, [chapterId]);
  useEffect(() => { load(); }, [load]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const toggleIn = (key, value) => setForm((f) => ({ ...f, [key]: f[key].includes(value) ? f[key].filter((v) => v !== value) : [...f[key], value] }));

  async function save() {
    if (!form.name.trim()) { notify('Name the site', 'Use the name volunteers will see.'); return; }
    if (form.days.length && (!HHMM.test(form.open) || !HHMM.test(form.close) || form.open >= form.close)) {
      notify('Check the hours', 'Use 24-hour times like 09:00 and 17:00, with closing after opening.'); return;
    }
    const packages = form.packages.trim() ? parseInt(form.packages, 10) : null;
    const weight = form.weight.trim() ? Number(form.weight) : null;
    if ((form.packages.trim() && !(packages > 0)) || (form.weight.trim() && !(weight > 0))) {
      notify('Check the capacity', 'Use whole items and pounds per day, or leave them blank for no limit.'); return;
    }
    const closureDates = form.closures.split(/[\s,]+/).filter(Boolean);
    if (closureDates.some((d) => !DAY_RE.test(d))) { notify('Check closed dates', 'Use dates like 2026-12-25, separated by commas.'); return; }
    const hours = form.days.length ? Object.fromEntries(form.days.map((d) => [d, [{ open: form.open, close: form.close }]])) : null;
    const site = {
      name: form.name.trim(), type: form.type, address: form.address.trim(), chapter_id: chapterId,
      food_categories: form.foods, capacity: { packages_per_day: packages, weight_lbs_per_day: weight },
      contacts: form.contactName.trim() ? [{ name: form.contactName.trim(), phone: form.contactPhone.trim(), role: 'receiving' }] : [],
      timezone: 'America/Chicago', storage: form.storage,
      closures: closureDates.map((date) => ({ date, reason: 'Closed' })),
    };
    if (hours) site.hours = hours;
    setBusy(true);
    try {
      await saveReceivingSite(editing === 'new' ? null : editing, site);
      setEditing(null); setForm(blank); await load();
    } catch (e) { notify('Could not save the site', e?.message || 'Try again.'); }
    finally { setBusy(false); }
  }

  async function togglePause(site) {
    const pausing = site.status !== 'paused';
    setBusy(true);
    try {
      await saveReceivingSite(site.id, { ...site, id: undefined, status: pausing ? 'paused' : 'active',
        pause_reason: pausing ? 'Paused by coordinator' : null });
      await load();
    } catch (e) { notify('Could not update the site', e?.message || 'Try again.'); }
    finally { setBusy(false); }
  }

  return (
    <Screen contentStyle={styles.content}>
      <ResponsiveContainer maxWidth={720}>
        <TouchableOpacity onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('MainTabs', { screen: 'Dashboard' }))}
          accessibilityRole="button">
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
        <BrushText variant="screenTitle">Receiving sites</BrushText>
        <Text style={styles.subtitle}>Where rescued food can go. Hours, pauses and daily capacity are checked when you confirm a rescue.</Text>

        {sites === null && <ActivityIndicator color={Colors.green} />}
        {!!error && <Text style={styles.error}>{error}</Text>}
        {sites?.length === 0 && !editing && <Text style={styles.empty}>No receiving sites yet. Add the places your chapter delivers to.</Text>}
        {sites?.map((site) => {
          const now = describeSiteNow(site);
          return (
            <View key={site.id} style={styles.card}>
              <View style={styles.rowBetween}>
                <Text style={styles.siteName}>{site.name}</Text>
                <Text style={[styles.badge, now.tone === 'warn' && styles.badgeWarn]}>{now.label}</Text>
              </View>
              <Text style={styles.meta}>{SITE_TYPES[site.type] || site.type}{site.address ? ` · ${site.address}` : ''}</Text>
              <Text style={styles.meta}>{now.detail}</Text>
              <View style={styles.actions}>
                <Button title="Edit" variant="secondary" onPress={() => { setEditing(site.id); setForm(toForm(site)); }} />
                <Button title={site.status === 'paused' ? 'Resume' : 'Pause'} variant="secondary" onPress={() => togglePause(site)} disabled={busy} />
              </View>
            </View>
          );
        })}

        {!editing && <Button title="Add a receiving site" onPress={() => { setEditing('new'); setForm(blank); }} />}

        {editing && (
          <View style={styles.card}>
            <Text style={styles.formTitle}>{editing === 'new' ? 'New receiving site' : 'Edit site'}</Text>
            <Text style={styles.label}>Name</Text>
            <TextInput style={styles.input} value={form.name} onChangeText={(v) => set({ name: v })} accessibilityLabel="Site name" />
            <Text style={styles.label}>Type</Text>
            <View style={styles.chips}>
              {Object.entries(SITE_TYPES).map(([key, label]) => (
                <TouchableOpacity key={key} onPress={() => set({ type: key })} accessibilityRole="radio" accessibilityState={{ selected: form.type === key }}
                  style={[styles.chip, form.type === key && styles.chipOn]}>
                  <Text style={[styles.chipText, form.type === key && styles.chipTextOn]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.label}>Address</Text>
            <TextInput style={styles.input} value={form.address} onChangeText={(v) => set({ address: v })} accessibilityLabel="Site address" />
            <Text style={styles.label}>Receiving days</Text>
            <View style={styles.chips}>
              {DAY_KEYS.map((d) => (
                <TouchableOpacity key={d} onPress={() => toggleIn('days', d)} accessibilityRole="checkbox" accessibilityState={{ checked: form.days.includes(d) }}
                  style={[styles.chipSm, form.days.includes(d) && styles.chipOn]}>
                  <Text style={[styles.chipText, form.days.includes(d) && styles.chipTextOn]}>{d[0].toUpperCase() + d.slice(1)}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.help}>Leave every day off for partners without fixed hours; they’ll show as “hours unknown”.</Text>
            <View style={styles.row}>
              <View style={styles.field}><Text style={styles.label}>Opens</Text>
                <TextInput style={styles.input} value={form.open} onChangeText={(v) => set({ open: v })} placeholder="09:00" accessibilityLabel="Opening time" /></View>
              <View style={styles.field}><Text style={styles.label}>Closes</Text>
                <TextInput style={styles.input} value={form.close} onChangeText={(v) => set({ close: v })} placeholder="17:00" accessibilityLabel="Closing time" /></View>
            </View>
            <Text style={styles.label}>Food they accept</Text>
            <View style={styles.chips}>
              {FOOD_CATEGORIES.map((c) => (
                <TouchableOpacity key={c.key} onPress={() => toggleIn('foods', c.key)} accessibilityRole="checkbox" accessibilityState={{ checked: form.foods.includes(c.key) }}
                  style={[styles.chipSm, form.foods.includes(c.key) && styles.chipOn]}>
                  <Text style={[styles.chipText, form.foods.includes(c.key) && styles.chipTextOn]}>{c.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.label}>Storage on site</Text>
            <View style={styles.chips}>
              {STORAGE.map(([key, label]) => (
                <TouchableOpacity key={key} onPress={() => toggleIn('storage', key)} accessibilityRole="checkbox" accessibilityState={{ checked: form.storage.includes(key) }}
                  style={[styles.chipSm, form.storage.includes(key) && styles.chipOn]}>
                  <Text style={[styles.chipText, form.storage.includes(key) && styles.chipTextOn]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.label}>Closed dates</Text>
            <TextInput style={styles.input} value={form.closures} onChangeText={(v) => set({ closures: v })} placeholder="2026-12-25, 2027-01-01"
              accessibilityLabel="Closed dates, comma separated" />
            <View style={styles.row}>
              <View style={styles.field}><Text style={styles.label}>Items per day</Text>
                <TextInput style={styles.input} value={form.packages} onChangeText={(v) => set({ packages: v })} keyboardType="number-pad" placeholder="No limit" accessibilityLabel="Items per day" /></View>
              <View style={styles.field}><Text style={styles.label}>Pounds per day</Text>
                <TextInput style={styles.input} value={form.weight} onChangeText={(v) => set({ weight: v })} keyboardType="decimal-pad" placeholder="No limit" accessibilityLabel="Pounds per day" /></View>
            </View>
            <View style={styles.row}>
              <View style={styles.field}><Text style={styles.label}>Receiving contact</Text>
                <TextInput style={styles.input} value={form.contactName} onChangeText={(v) => set({ contactName: v })} accessibilityLabel="Receiving contact name" /></View>
              <View style={styles.field}><Text style={styles.label}>Phone</Text>
                <TextInput style={styles.input} value={form.contactPhone} onChangeText={(v) => set({ contactPhone: v })} keyboardType="phone-pad" accessibilityLabel="Receiving contact phone" /></View>
            </View>
            <View style={styles.actions}>
              <Button title={busy ? 'Saving…' : 'Save site'} onPress={save} loading={busy} />
              <Button title="Cancel" variant="secondary" onPress={() => { setEditing(null); setForm(blank); }} />
            </View>
          </View>
        )}
      </ResponsiveContainer>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 12, paddingBottom: 40, paddingHorizontal: 20 },
  back: { color: Colors.green, fontSize: 15, fontWeight: '600', paddingVertical: 8 },
  subtitle: { ...Type.body, color: Colors.gray, marginTop: 6, marginBottom: 16 },
  card: { backgroundColor: Colors.white, borderRadius: 14, borderWidth: 1, borderColor: Colors.grayLight, padding: 14, marginBottom: 12 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  siteName: { fontSize: 16, fontWeight: '700', color: Colors.dark, flex: 1 },
  badge: { fontSize: 12, fontWeight: '700', color: Colors.green, backgroundColor: Colors.greenLight, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, overflow: 'hidden' },
  badgeWarn: { color: '#7A4E0E', backgroundColor: Colors.amberLight },
  meta: { fontSize: 13, color: Colors.gray, marginTop: 4, lineHeight: 18 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12, flexWrap: 'wrap' },
  formTitle: { fontSize: 16, fontWeight: '700', color: Colors.dark },
  label: { fontSize: 14, fontWeight: '700', color: Colors.dark, marginTop: 12, marginBottom: 6 },
  help: { fontSize: 13, color: Colors.gray, marginTop: 6 },
  input: { borderWidth: 1, borderColor: Colors.grayLight, borderRadius: 12, backgroundColor: Colors.white, paddingHorizontal: 12,
    paddingVertical: 10, fontSize: 16, color: Colors.dark, minHeight: 46 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: Colors.grayLight, borderRadius: 999, paddingVertical: 9, paddingHorizontal: 14, minHeight: 44, justifyContent: 'center', backgroundColor: Colors.white },
  chipSm: { borderWidth: 1, borderColor: Colors.grayLight, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 12, minHeight: 40, justifyContent: 'center', backgroundColor: Colors.white },
  chipOn: { backgroundColor: Colors.green, borderColor: Colors.green },
  chipText: { fontSize: 14, fontWeight: '600', color: Colors.dark },
  chipTextOn: { color: Colors.white },
  row: { flexDirection: 'row', gap: 12 },
  field: { flex: 1 },
  empty: { fontSize: 15, color: Colors.gray, marginBottom: 12 },
  error: { fontSize: 14, color: '#9B2C2C', marginBottom: 12 },
});
