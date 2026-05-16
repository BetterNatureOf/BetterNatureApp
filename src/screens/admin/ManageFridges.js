// Admin: manage the community fridge network. List, add, edit, deactivate.
// Used by execs/admins from the AdminPanel. Writes feed both the app's
// FridgePicker and the website's Leaflet map.
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import PlaceInput from '../../components/ui/PlaceInput';
import ResponsiveContainer from '../../components/ui/ResponsiveContainer';
import AnimatedPressable from '../../components/ui/AnimatedPressable';
import Icon from '../../components/ui/Icon';
import { listFridges, createFridge, updateFridge } from '../../services/fridges';
import { notify, notifyThen, confirm } from '../../services/ui';

const blank = {
  name: '', address: '', city: '', state: '', zip: '',
  lat: '', lng: '',
  hours: 'Open 24/7',
  capacity: 'medium',
  chapter_id: '',
};

export default function ManageFridges({ navigation }) {
  const [fridges, setFridges] = useState(null);
  const [editing, setEditing] = useState(null); // null | 'new' | fridge object
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);

  async function refresh() {
    try { setFridges(await listFridges()); } catch { setFridges([]); }
  }
  useEffect(() => { refresh(); }, []);

  function openNew() { setForm(blank); setEditing('new'); }
  function openEdit(f) {
    setForm({
      name: f.name || '', address: f.address || '',
      city: f.city || '', state: f.state || '', zip: f.zip || '',
      lat: f.lat != null ? String(f.lat) : '',
      lng: f.lng != null ? String(f.lng) : '',
      hours: f.hours || '', capacity: f.capacity || 'medium',
      chapter_id: f.chapter_id || '',
    });
    setEditing(f);
  }
  function close() { setEditing(null); setForm(blank); }

  async function save() {
    if (!form.name.trim()) return notify('Name required', 'Give this fridge a recognizable name.');
    const lat = form.lat ? parseFloat(form.lat) : null;
    const lng = form.lng ? parseFloat(form.lng) : null;
    if (form.lat && (Number.isNaN(lat) || lat < -90 || lat > 90)) return notify('Lat invalid', 'Latitude must be between -90 and 90.');
    if (form.lng && (Number.isNaN(lng) || lng < -180 || lng > 180)) return notify('Lng invalid', 'Longitude must be between -180 and 180.');

    setSaving(true);
    try {
      const data = {
        name: form.name.trim(),
        address: form.address.trim(),
        city: form.city.trim(),
        state: form.state.trim(),
        zip: form.zip.trim(),
        lat, lng,
        hours: form.hours.trim(),
        capacity: form.capacity,
        chapter_id: form.chapter_id.trim() || null,
        active: true,
      };
      if (editing === 'new') await createFridge(data);
      else await updateFridge(editing.id, data);
      await refresh();
      notifyThen('Saved', 'Fridge network updated.', () => close());
    } catch (e) {
      notify('Could not save', e?.message || 'Try again.');
    } finally { setSaving(false); }
  }

  async function deactivate() {
    if (editing === 'new' || !editing) return;
    const ok = await confirm('Deactivate this fridge?', 'It will hide from the app and the website map. You can re-activate later by editing it.');
    if (!ok) return;
    setSaving(true);
    try {
      await updateFridge(editing.id, { active: false });
      await refresh();
      close();
    } catch (e) {
      notify('Could not deactivate', e?.message || 'Try again.');
    } finally { setSaving(false); }
  }

  if (editing) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <ResponsiveContainer maxWidth={640}>
          <AnimatedPressable onPress={close} style={styles.back} scaleTo={0.97}>
            <Icon name="back" size={18} color={Colors.green} />
            <Text style={styles.backText}>Cancel</Text>
          </AnimatedPressable>
          <BrushText variant="screenTitle" style={styles.title}>
            {editing === 'new' ? 'New fridge' : 'Edit fridge'}
          </BrushText>

          <Field label="Name">
            <Input value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} placeholder="Cooper-Young Fridge" />
          </Field>

          <Field label="Street address">
            <Input value={form.address} onChangeText={(v) => setForm({ ...form, address: v })} placeholder="2150 Young Ave" />
          </Field>

          <Field label="City">
            <PlaceInput
              value={form.city}
              onChange={(v) => {
                const m = /,\s*([A-Z]{2})$/.exec(v || '');
                if (m) setForm({ ...form, city: v.split(',')[0], state: m[1] });
                else setForm({ ...form, city: v });
              }}
              placeholder="Memphis"
            />
          </Field>

          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Field label="State"><Input value={form.state} onChangeText={(v) => setForm({ ...form, state: v })} autoCapitalize="characters" maxLength={2} placeholder="TN" /></Field>
            </View>
            <View style={{ width: 12 }} />
            <View style={{ flex: 1 }}>
              <Field label="ZIP"><Input value={form.zip} onChangeText={(v) => setForm({ ...form, zip: v })} keyboardType="number-pad" maxLength={5} placeholder="38104" /></Field>
            </View>
          </View>

          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Field label="Latitude"><Input value={form.lat} onChangeText={(v) => setForm({ ...form, lat: v })} placeholder="35.1240" keyboardType="decimal-pad" /></Field>
            </View>
            <View style={{ width: 12 }} />
            <View style={{ flex: 1 }}>
              <Field label="Longitude"><Input value={form.lng} onChangeText={(v) => setForm({ ...form, lng: v })} placeholder="-89.9970" keyboardType="decimal-pad" /></Field>
            </View>
          </View>
          <Text style={styles.hint}>
            Tip: paste the address into Google Maps, right-click the pin, copy the coordinates.
          </Text>

          <Field label="Hours">
            <Input value={form.hours} onChangeText={(v) => setForm({ ...form, hours: v })} placeholder="Open 24/7" />
          </Field>

          <Field label="Capacity">
            <View style={styles.chipsRow}>
              {['low', 'medium', 'high'].map((c) => (
                <AnimatedPressable
                  key={c}
                  onPress={() => setForm({ ...form, capacity: c })}
                  style={[styles.chip, form.capacity === c && styles.chipOn]}
                  scaleTo={0.97}
                >
                  <Text style={[styles.chipText, form.capacity === c && styles.chipTextOn]}>
                    {c === 'low' ? 'Light load' : c === 'high' ? 'Lots of room' : 'Medium'}
                  </Text>
                </AnimatedPressable>
              ))}
            </View>
          </Field>

          <Field label="Chapter ID (optional)">
            <Input value={form.chapter_id} onChangeText={(v) => setForm({ ...form, chapter_id: v })} placeholder="ch-memphis" autoCapitalize="none" />
          </Field>

          <Button title={saving ? 'Saving…' : 'Save fridge'} onPress={save} loading={saving} style={{ marginTop: 18 }} />
          {editing !== 'new' ? (
            <AnimatedPressable onPress={deactivate} style={styles.deactivate} scaleTo={0.98}>
              <Text style={styles.deactivateText}>Deactivate this fridge</Text>
            </AnimatedPressable>
          ) : null}
        </ResponsiveContainer>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ResponsiveContainer maxWidth={720}>
        <AnimatedPressable onPress={() => navigation.goBack()} style={styles.back} scaleTo={0.97}>
          <Icon name="back" size={18} color={Colors.green} />
          <Text style={styles.backText}>Back</Text>
        </AnimatedPressable>
        <View style={styles.headerRow}>
          <BrushText variant="screenTitle" style={styles.title}>Community fridges</BrushText>
          <AnimatedPressable onPress={openNew} style={styles.addBtn} scaleTo={0.96}>
            <Icon name="plus" size={16} color={Colors.white} />
            <Text style={styles.addBtnText}>Add fridge</Text>
          </AnimatedPressable>
        </View>
        <Text style={styles.subtitle}>
          Every fridge here shows up in the app picker and on the website map.
        </Text>

        {fridges == null ? (
          <View style={styles.loading}><ActivityIndicator color={Colors.green} /></View>
        ) : fridges.length === 0 ? (
          <View style={styles.empty}>
            <Icon name="info" size={20} color={Colors.gray} />
            <Text style={styles.emptyText}>
              No fridges yet. Add your first one — it’ll appear on the map immediately.
            </Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {fridges.map((f) => (
              <AnimatedPressable key={f.id} onPress={() => openEdit(f)} style={styles.row2} scaleTo={0.99}>
                <View style={styles.iconWrap}>
                  <Icon name="pin" size={18} color={Colors.green} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fName}>{f.name}</Text>
                  <Text style={styles.fMeta}>
                    {f.address || `${f.city || ''}${f.state ? ', ' + f.state : ''}`}
                  </Text>
                </View>
                <Icon name="chevron" size={18} color={Colors.grayMid} />
              </AnimatedPressable>
            ))}
          </View>
        )}
      </ResponsiveContainer>
    </ScrollView>
  );
}

function Field({ label, children }) {
  return (
    <View style={{ marginTop: 14 }}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  content: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 },
  backText: { fontSize: 15, color: Colors.green, fontWeight: '600' },
  title: { color: Colors.green, marginTop: 4 },
  subtitle: { ...Type.body, color: Colors.gray, marginTop: 4, marginBottom: 20 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.green, paddingVertical: 9, paddingHorizontal: 14, borderRadius: 12,
  },
  addBtnText: { color: Colors.white, fontWeight: '700', fontSize: 14 },
  loading: { paddingVertical: 36, alignItems: 'center' },
  empty: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    padding: 16, marginTop: 16,
    backgroundColor: Colors.greenLight, borderRadius: Radius.lg,
  },
  emptyText: { flex: 1, ...Type.caption, color: Colors.gray },
  row2: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.white,
    borderRadius: Radius.lg, padding: 14,
    ...Shadows.soft,
  },
  iconWrap: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: Colors.greenLight,
    alignItems: 'center', justifyContent: 'center',
  },
  fName: { fontSize: 15, fontWeight: '700', color: Colors.dark },
  fMeta: { ...Type.caption, marginTop: 2 },

  label: { fontSize: 13, fontWeight: '700', color: Colors.dark, marginBottom: 6 },
  row: { flexDirection: 'row' },
  hint: { ...Type.caption, marginTop: 6, color: Colors.gray },
  chipsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    paddingVertical: 9, paddingHorizontal: 14,
    backgroundColor: Colors.white,
    borderRadius: 999, borderWidth: 1.5, borderColor: Colors.glassBorder,
  },
  chipOn: { backgroundColor: Colors.green, borderColor: Colors.green },
  chipText: { fontSize: 13, fontWeight: '600', color: Colors.dark },
  chipTextOn: { color: Colors.white },
  deactivate: { alignItems: 'center', paddingVertical: 14, marginTop: 6 },
  deactivateText: { fontSize: 13, fontWeight: '600', color: Colors.pink },
});
