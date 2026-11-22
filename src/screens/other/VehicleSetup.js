// What a volunteer can carry. Read by rescue dispatch (known mismatches
// aren't alerted) and coordinator suggestions. Every field is optional:
// anything left blank is treated as unknown, never as a fit.
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Type, Radius } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import ResponsiveContainer from '../../components/ui/ResponsiveContainer';
import Screen from '../../components/ui/Screen';
import Button from '../../components/ui/Button';
import useAuthStore from '../../store/authStore';
import { saveVehicle } from '../../services/database';
import { notify } from '../../services/ui';
import { VEHICLES, EQUIPMENT } from '../../../functions/lib/rescueCargo';
import { BrandHero, BrandSheet } from '../../components/ui/BrandHero';

const toInt = (v) => (/^\d+$/.test(String(v).trim()) ? parseInt(v, 10) : null);
const toNum = (v) => (String(v).trim() && Number.isFinite(Number(v)) ? Number(v) : null);

export default function VehicleSetup({ navigation }) {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const current = user?.vehicle || {};
  const [type, setType] = useState(current.type || null);
  const [packages, setPackages] = useState(current.package_capacity ? String(current.package_capacity) : '');
  const [weight, setWeight] = useState(current.weight_capacity_lbs ? String(current.weight_capacity_lbs) : '');
  const [equipment, setEquipment] = useState(current.equipment || []);
  const [saving, setSaving] = useState(false);

  function pickType(key) {
    setType(key);
    const preset = VEHICLES.find((v) => v.key === key);
    // Offer typical numbers only when the volunteer hasn't entered their own.
    if (preset && !packages) setPackages(String(preset.packages));
    if (preset && !weight) setWeight(String(preset.weight));
  }
  const toggle = (key) => setEquipment((list) => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key]));

  async function save() {
    if (!type) { notify('Choose how you travel', 'Pick the vehicle you usually take on rescues.'); return; }
    const packageCapacity = packages.trim() ? toInt(packages) : null;
    const weightCapacityLbs = weight.trim() ? toNum(weight) : null;
    if (packages.trim() && !(packageCapacity > 0)) { notify('Check the package count', 'Use a whole number, like 6.'); return; }
    if (weight.trim() && !(weightCapacityLbs > 0)) { notify('Check the weight', 'Use pounds, like 150.'); return; }
    setSaving(true);
    try {
      const vehicle = await saveVehicle(user.id, { type, packageCapacity, weightCapacityLbs, equipment });
      setUser({ ...user, vehicle: { ...vehicle, updated_at: new Date().toISOString() } });
      notify('Saved', 'Rescue offers will now check what you can carry.');
      if (navigation.canGoBack()) navigation.goBack();
    } catch (e) {
      notify('Could not save', e?.message || 'Check your connection and try again.');
    } finally { setSaving(false); }
  }

  return (
    <Screen contentStyle={{ padding: 0 }}>
      <BrandHero title="Your rescue vehicle" subtitle="We use this to send you rescues you can actually carry. Leave anything you’re unsure of blank." onBack={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('MainTabs', { screen: 'Profile' }))} />
      <BrandSheet>
      <ResponsiveContainer maxWidth={680}>

        <Text style={styles.label}>How do you usually travel?</Text>
        <View style={styles.chips}>
          {VEHICLES.map((v) => (
            <TouchableOpacity key={v.key} onPress={() => pickType(v.key)} accessibilityRole="radio"
              accessibilityState={{ selected: type === v.key }} style={[styles.chip, type === v.key && styles.chipOn]}>
              <Text style={[styles.chipText, type === v.key && styles.chipTextOn]}>{v.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.row}>
          <View style={styles.field}>
            <Text style={styles.label}>Boxes or trays you can fit</Text>
            <TextInput value={packages} onChangeText={setPackages} keyboardType="number-pad" placeholder="e.g. 6"
              style={styles.input} accessibilityLabel="Boxes or trays you can fit" placeholderTextColor={Colors.grayMid} />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Most weight (lb)</Text>
            <TextInput value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder="e.g. 150"
              style={styles.input} accessibilityLabel="Most weight you can carry, in pounds" placeholderTextColor={Colors.grayMid} />
          </View>
        </View>

        <Text style={styles.label}>Equipment you bring</Text>
        {EQUIPMENT.map((e) => {
          const on = equipment.includes(e.key);
          return (
            <TouchableOpacity key={e.key} onPress={() => toggle(e.key)} style={styles.check}
              accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
              <View style={[styles.box, on && styles.boxOn]}>{on && <Text style={styles.tick}>✓</Text>}</View>
              <Text style={styles.checkText}>{e.label}</Text>
            </TouchableOpacity>
          );
        })}
        <Text style={styles.help}>Cold food needs a cooler, hot food needs insulated bags, and loads over 150 lb need a hand truck.</Text>

        <Button title={saving ? 'Saving…' : 'Save vehicle'} onPress={save} loading={saving} />
      </ResponsiveContainer>
    </BrandSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 12, paddingBottom: 40, paddingHorizontal: 20 },
  back: { color: Colors.green, fontSize: 15, fontWeight: '600', paddingVertical: 8 },
  title: { marginTop: 4 },
  subtitle: { ...Type.body, color: Colors.gray, marginTop: 6, marginBottom: 18 },
  label: { fontSize: 14, fontWeight: '700', color: Colors.dark, marginTop: 14, marginBottom: 8 },
  help: { ...Type.caption, color: Colors.gray, marginTop: 6, marginBottom: 18 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: Colors.grayLight, backgroundColor: Colors.white, borderRadius: 999,
    paddingVertical: 10, paddingHorizontal: 14, minHeight: 44, justifyContent: 'center' },
  chipOn: { backgroundColor: Colors.green, borderColor: Colors.green },
  chipText: { fontSize: 15, fontWeight: '600', color: Colors.dark },
  chipTextOn: { color: Colors.white },
  row: { flexDirection: 'row', gap: 12 },
  field: { flex: 1 },
  input: { borderWidth: 1, borderColor: Colors.grayLight, borderRadius: Radius?.md || 12, backgroundColor: Colors.white,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: Colors.dark, minHeight: 48 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, minHeight: 44 },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 1.5, borderColor: Colors.grayMid, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: Colors.green, borderColor: Colors.green },
  tick: { color: Colors.white, fontWeight: '800', fontSize: 14 },
  checkText: { fontSize: 15, color: Colors.dark },
});
