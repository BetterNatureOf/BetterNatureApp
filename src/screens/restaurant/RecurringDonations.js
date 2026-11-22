// Donor recurring donations: confirm or skip today's occurrence with the
// actual amount (minimal typing — the usual amounts are prefilled), and
// set up or pause the weekly schedule. Nothing reaches partners or
// volunteers until the donor confirms an occurrence.
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Colors, Type } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import ResponsiveContainer from '../../components/ui/ResponsiveContainer';
import Screen from '../../components/ui/Screen';
import Button from '../../components/ui/Button';
import useAuthStore from '../../store/authStore';
import { listMySchedules, saveDonationSchedule, listMyOccurrences, confirmDonationOccurrence, listPartnerSites } from '../../services/database';
import { notify } from '../../services/ui';
import { FOOD_CATEGORIES, categoryOf } from '../../../functions/lib/rescueCargo';

const DAYS = [['mon', 'Mon'], ['tue', 'Tue'], ['wed', 'Wed'], ['thu', 'Thu'], ['fri', 'Fri'], ['sat', 'Sat'], ['sun', 'Sun']];
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const toMs = (v) => (v?.toMillis ? v.toMillis() : typeof v === 'string' ? Date.parse(v) : null);
const tz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Chicago'; } catch { return 'America/Chicago'; } };

export default function RecurringDonations({ navigation }) {
  const user = useAuthStore((s) => s.user);
  const [schedules, setSchedules] = useState(null);
  const [occurrences, setOccurrences] = useState([]);
  const [sites, setSites] = useState([]);
  const [form, setForm] = useState(null);
  const [actual, setActual] = useState({});
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    try {
      const [s, o] = await Promise.all([listMySchedules(user?.id), listMyOccurrences(user?.id)]);
      setSchedules(s); setOccurrences(o);
    } catch (e) { setSchedules([]); notify('Could not load recurring donations', e?.message || 'Try again.'); }
  }, [user?.id]);
  useEffect(() => { load(); listPartnerSites().then(setSites).catch(() => setSites([])); }, [load]);

  const open = occurrences.filter((o) => o.status === 'awaiting_donor');
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  async function confirmOcc(o, skip = false) {
    const a = actual[o.id] || {};
    setBusy(o.id);
    try {
      await confirmDonationOccurrence(o.id, skip ? { skip: true } : {
        estimated_weight_lbs: Number(a.weight ?? o.template?.estimated_weight_lbs),
        packages: a.packages ?? o.template?.packages ?? null,
        food_category: o.template?.food_category || null,
        ready_for_hours: Number(a.hours ?? 3),
      });
      notify(skip ? 'Skipped' : 'Donation posted', skip ? 'We won’t ask anyone today.' : 'Your receiving partner is being asked. Volunteers are contacted after a partner accepts.');
      await load();
    } catch (e) { notify('Could not save', e?.message || 'Try again.'); }
    finally { setBusy(null); }
  }

  async function saveSchedule() {
    if (!form.days.length || !HHMM.test(form.ready_time)) { notify('Check days and time', 'Pick at least one day and a 24-hour time like 15:00.'); return; }
    const weight = Number(form.weight);
    if (!(weight > 0)) { notify('Usual amount', 'Enter your usual pounds (an estimate is fine).'); return; }
    setBusy('form');
    try {
      await saveDonationSchedule(form.id || null, {
        restaurant_id: user.restaurant_id, chapter_id: user.chapter_id, owner_uid: user.id, status: form.status || 'active',
        days: form.days, ready_time: form.ready_time, timezone: tz(), window_hours: Number(form.window_hours) || 3,
        template: { food_category: form.food_category, packages: form.packages ? parseInt(form.packages, 10) : null, estimated_weight_lbs: weight, notes: form.notes || '' },
        destination: { mode: form.mode, site_id: form.mode === 'preferred' ? form.site_id : null, offer_to_network: form.offer_to_network },
        skip_dates: form.skip_dates || [],
      });
      setForm(null); await load();
    } catch (e) { notify('Could not save the schedule', e?.message || 'Try again.'); }
    finally { setBusy(null); }
  }

  async function togglePause(s) {
    setBusy(s.id);
    try { await saveDonationSchedule(s.id, { ...s, id: undefined, status: s.status === 'paused' ? 'active' : 'paused' }); await load(); }
    catch (e) { notify('Could not update', e?.message || 'Try again.'); }
    finally { setBusy(null); }
  }

  const newForm = () => ({ days: ['mon', 'wed', 'fri'], ready_time: '15:00', window_hours: '3', weight: '', packages: '',
    food_category: null, notes: '', mode: 'network', site_id: null, offer_to_network: true });

  return (
    <Screen contentStyle={styles.content}>
      <ResponsiveContainer maxWidth={680}>
        <TouchableOpacity onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('RestDashboard'))} accessibilityRole="button">
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
        <BrushText variant="screenTitle">Recurring donations</BrushText>
        <Text style={styles.subtitle}>We’ll check with you before each one. Nothing is posted until you confirm what you actually have.</Text>

        {open.map((o) => (
          <View key={o.id} style={[styles.card, styles.cardDue]}>
            <Text style={styles.cardTitle}>Today’s donation · ready {new Date(toMs(o.ready_at)).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Text>
            <Text style={styles.meta}>Usually {o.template?.estimated_weight_lbs} lb{o.template?.packages ? ` · ${o.template.packages} items` : ''}{o.template?.food_category ? ` · ${categoryOf(o.template.food_category)?.label}` : ''}</Text>
            <View style={styles.row}>
              <Field label="Pounds today (estimate)" value={actual[o.id]?.weight ?? String(o.template?.estimated_weight_lbs ?? '')}
                onChange={(v) => setActual((a) => ({ ...a, [o.id]: { ...a[o.id], weight: v } }))} keyboard="decimal-pad" />
              <Field label="Items" value={actual[o.id]?.packages ?? String(o.template?.packages ?? '')}
                onChange={(v) => setActual((a) => ({ ...a, [o.id]: { ...a[o.id], packages: v ? parseInt(v, 10) : null } }))} keyboard="number-pad" />
            </View>
            <Field label="Available for (hours)" value={actual[o.id]?.hours ?? '3'} onChange={(v) => setActual((a) => ({ ...a, [o.id]: { ...a[o.id], hours: v } }))} keyboard="decimal-pad" />
            <View style={styles.actions}>
              <Button title="Confirm and post" onPress={() => confirmOcc(o)} loading={busy === o.id} />
              <Button title="Skip today" variant="secondary" onPress={() => confirmOcc(o, true)} disabled={busy === o.id} />
            </View>
          </View>
        ))}

        <Text style={styles.section}>Your schedules</Text>
        {schedules === null && <ActivityIndicator color={Colors.green} />}
        {schedules?.length === 0 && !form && <Text style={styles.meta}>No recurring donations yet.</Text>}
        {schedules?.map((s) => (
          <View key={s.id} style={styles.card}>
            <Text style={styles.cardTitle}>{s.days.map((d) => DAYS.find(([k]) => k === d)?.[1]).join(', ')} · {s.ready_time}</Text>
            <Text style={styles.meta}>About {s.template?.estimated_weight_lbs} lb · {s.destination?.mode === 'preferred' ? `to ${sites.find((x) => x.id === s.destination.site_id)?.name || 'your partner'}` : s.destination?.mode === 'network' ? 'to any BN partner' : 'coordinator decides'}{s.status === 'paused' ? ' · Paused' : ''}</Text>
            <View style={styles.actions}>
              <Button title={s.status === 'paused' ? 'Resume' : 'Pause'} variant="secondary" onPress={() => togglePause(s)} disabled={busy === s.id} />
            </View>
          </View>
        ))}
        {!form && <Button title="Set up a recurring donation" onPress={() => setForm(newForm())} />}

        {form && (
          <View style={styles.card}>
            <Text style={styles.label}>Days</Text>
            <View style={styles.chips}>
              {DAYS.map(([k, label]) => (
                <TouchableOpacity key={k} onPress={() => set({ days: form.days.includes(k) ? form.days.filter((d) => d !== k) : [...form.days, k] })}
                  accessibilityRole="checkbox" accessibilityState={{ checked: form.days.includes(k) }} style={[styles.chip, form.days.includes(k) && styles.chipOn]}>
                  <Text style={[styles.chipText, form.days.includes(k) && styles.chipTextOn]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.row}>
              <Field label="Ready at (24h)" value={form.ready_time} onChange={(v) => set({ ready_time: v })} />
              <Field label="Available for (h)" value={form.window_hours} onChange={(v) => set({ window_hours: v })} keyboard="decimal-pad" />
            </View>
            <View style={styles.row}>
              <Field label="Usual pounds" value={form.weight} onChange={(v) => set({ weight: v })} keyboard="decimal-pad" />
              <Field label="Usual items" value={form.packages} onChange={(v) => set({ packages: v.replace(/[^\d]/g, '') })} keyboard="number-pad" />
            </View>
            <Text style={styles.label}>Usual food</Text>
            <View style={styles.chips}>
              {FOOD_CATEGORIES.map((c) => (
                <TouchableOpacity key={c.key} onPress={() => set({ food_category: form.food_category === c.key ? null : c.key })}
                  accessibilityRole="radio" accessibilityState={{ selected: form.food_category === c.key }} style={[styles.chip, form.food_category === c.key && styles.chipOn]}>
                  <Text style={[styles.chipText, form.food_category === c.key && styles.chipTextOn]}>{c.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.label}>Where it goes</Text>
            <View style={styles.chips}>
              {[['network', 'Any BN partner'], ['preferred', 'A partner I work with'], ['coordinator', 'Coordinator decides']].map(([k, label]) => (
                <TouchableOpacity key={k} onPress={() => set({ mode: k })} accessibilityRole="radio" accessibilityState={{ selected: form.mode === k }}
                  style={[styles.chip, form.mode === k && styles.chipOn]}>
                  <Text style={[styles.chipText, form.mode === k && styles.chipTextOn]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {form.mode === 'preferred' && (
              <View style={styles.chips}>
                {sites.map((site) => (
                  <TouchableOpacity key={site.id} onPress={() => set({ site_id: site.id })} accessibilityRole="radio"
                    accessibilityState={{ selected: form.site_id === site.id }} style={[styles.chip, form.site_id === site.id && styles.chipOn]}>
                    <Text style={[styles.chipText, form.site_id === site.id && styles.chipTextOn]}>{site.name}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity onPress={() => set({ offer_to_network: !form.offer_to_network })} accessibilityRole="checkbox" accessibilityState={{ checked: form.offer_to_network }}>
                  <Text style={styles.meta}>{form.offer_to_network ? '☑' : '☐'} If they decline or don’t answer, offer it to other BN partners</Text>
                </TouchableOpacity>
              </View>
            )}
            <View style={styles.actions}>
              <Button title="Save schedule" onPress={saveSchedule} loading={busy === 'form'} />
              <Button title="Cancel" variant="secondary" onPress={() => setForm(null)} />
            </View>
          </View>
        )}
        <Text style={styles.footnote}>Holidays or a closed day? Use “Skip today” when we ask, or pause the schedule.</Text>
      </ResponsiveContainer>
    </Screen>
  );
}

function Field({ label, value, onChange, keyboard }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={styles.input} value={value} onChangeText={onChange} keyboardType={keyboard} accessibilityLabel={label} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 12, paddingBottom: 40, paddingHorizontal: 20 },
  back: { color: Colors.green, fontSize: 15, fontWeight: '600', paddingVertical: 8 },
  subtitle: { ...Type.body, color: Colors.gray, marginTop: 6, marginBottom: 12 },
  section: { fontSize: 17, fontWeight: '700', color: Colors.dark, marginTop: 16, marginBottom: 8 },
  card: { backgroundColor: Colors.white, borderRadius: 14, borderWidth: 1, borderColor: Colors.grayLight, padding: 14, marginBottom: 12, gap: 6 },
  cardDue: { borderColor: Colors.green },
  cardTitle: { fontSize: 16, fontWeight: '700', color: Colors.dark },
  meta: { fontSize: 13, color: Colors.gray, lineHeight: 18 },
  label: { fontSize: 14, fontWeight: '700', color: Colors.dark, marginTop: 6 },
  input: { borderWidth: 1, borderColor: Colors.grayLight, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, minHeight: 46, color: Colors.dark, backgroundColor: Colors.white },
  row: { flexDirection: 'row', gap: 12 },
  field: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: Colors.grayLight, borderRadius: 999, paddingVertical: 9, paddingHorizontal: 13, minHeight: 44, justifyContent: 'center', backgroundColor: Colors.white },
  chipOn: { backgroundColor: Colors.green, borderColor: Colors.green },
  chipText: { fontSize: 14, fontWeight: '600', color: Colors.dark },
  chipTextOn: { color: Colors.white },
  actions: { flexDirection: 'row', gap: 10, marginTop: 6, flexWrap: 'wrap' },
  footnote: { fontSize: 13, color: Colors.gray, marginTop: 12 },
});
