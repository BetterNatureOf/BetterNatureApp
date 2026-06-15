// BN Map — the unified BetterNature map.
//
//   Tab 1: Food Insecurity — hex tilegram colored by state-level rate
//          (Feeding America 2022). Hover any state for live BN
//          presence stats (chapters / fridges / gap cities).
//   Tab 2: Fridges — community-fridge dropoff network on a US plane
//          with hover tooltips for every fridge.
//
// Both tabs feed off the same data layers the marketing site uses,
// so the in-app map and the public map always tell the same story.
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking, Platform, TextInput } from 'react-native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import ResponsiveContainer from '../../components/ui/ResponsiveContainer';
import Screen from '../../components/ui/Screen';
import Button from '../../components/ui/Button';
import { POINTS, loadLiveFridges } from '../../data/impactMap';
import WorldInsecurityMap from '../../components/maps/WorldInsecurityMap';
import FridgeLeafletMap from '../../components/maps/FridgeLeafletMap';
import FridgeListView from '../../components/maps/FridgeListView';
import { createFridge } from '../../services/fridges';
import { fetchAllChapters } from '../../services/database';
import useAuthStore from '../../store/authStore';
import { notify } from '../../services/ui';
import { hasRole } from '../../services/roles';

const TABS = [
  { key: 'insecurity', label: 'Food Insecurity' },
  { key: 'fridges',    label: 'Fridges' },
];

export default function BNMap({ navigation }) {
  const user = useAuthStore((s) => s.user);
  const canAddFridge = hasRole(user, ['executive', 'admin', 'super_admin', 'chapter_president', 'chapter_pres']);
  const [tab, setTab] = useState('insecurity');
  const [fridgeView, setFridgeView] = useState('map'); // 'map' | 'list'
  const [fridges, setFridges] = useState([]);
  const [chapters, setChapters] = useState([]);
  const [showAddFridge, setShowAddFridge] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [geoState, setGeoState] = useState('idle'); // idle | asking | granted | denied | unsupported

  async function reloadFridges() {
    try {
      const list = await loadLiveFridges();
      setFridges(list);
    } catch {}
  }

  useEffect(() => {
    let alive = true;
    loadLiveFridges()
      .then((list) => { if (alive) setFridges(list); })
      .catch(() => {});
    // Chapter dropdown for the Add Fridge form.
    fetchAllChapters().then((cs) => { if (alive) setChapters(cs); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // Ask for geolocation the moment the user opens the Fridges tab.
  // We don't ask on mount because it'd be a creepy prompt before
  // the user has any indication of why we want their location.
  function requestLocation() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoState('unsupported');
      return;
    }
    setGeoState('asking');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation([pos.coords.latitude, pos.coords.longitude]);
        setGeoState('granted');
      },
      () => setGeoState('denied'),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60 * 1000 }
    );
  }

  const gaps = useMemo(() => POINTS.filter((p) => p.kind === 'gap'), []);

  const startChapter = (city, state) => {
    const subject = encodeURIComponent(`Start a chapter in ${city}, ${state}`);
    const body = encodeURIComponent(
      `Hi BetterNature team,\n\nI'd like to start a chapter in ${city}. Please send me the playbook.\n\n`
    );
    Linking.openURL(`mailto:info@betternatureofficial.org?subject=${subject}&body=${body}`);
  };

  return (
    <Screen contentStyle={styles.content}>
      <ResponsiveContainer maxWidth={1200}>
        {/* Header */}
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation?.goBack?.()}>
            <Text style={styles.back}>‹ Back</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.eyebrow}>Where we work. Where we don't.</Text>
        <BrushText variant="screenTitle" style={styles.title}>BN Map</BrushText>
        <Text style={styles.body}>
          Two views on the same fight, worldwide. Switch between the country-level
          food-insecurity heatmap and the live fridge network.
        </Text>

        {/* Tabs */}
        <View style={styles.tabs}>
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <TouchableOpacity
                key={t.key}
                style={[styles.tab, active && styles.tabActive]}
                onPress={() => setTab(t.key)}
                activeOpacity={0.85}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Map surface */}
        <View style={styles.surface}>
          {tab === 'insecurity' ? (
            <WorldInsecurityMap fridges={fridges} />
          ) : (
            <View>
              {/* Sub-toggle: Map | List */}
              <View style={styles.subToggleRow}>
                <View style={styles.subToggle}>
                  {[
                    { key: 'map',  label: 'Map' },
                    { key: 'list', label: 'List' },
                  ].map((opt) => {
                    const active = fridgeView === opt.key;
                    return (
                      <TouchableOpacity
                        key={opt.key}
                        style={[styles.subTab, active && styles.subTabActive]}
                        onPress={() => setFridgeView(opt.key)}
                      >
                        <Text style={[styles.subTabText, active && styles.subTabTextActive]}>{opt.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {geoState === 'idle' || geoState === 'denied' ? (
                  <TouchableOpacity onPress={requestLocation} style={styles.locateBtn}>
                    <Text style={styles.locateBtnText}>
                      {geoState === 'denied' ? 'Try location again' : 'Use my location'}
                    </Text>
                  </TouchableOpacity>
                ) : geoState === 'asking' ? (
                  <Text style={styles.locateState}>Getting location…</Text>
                ) : geoState === 'granted' ? (
                  <Text style={styles.locateStateOn}>Centered on you</Text>
                ) : null}
              </View>

              {canAddFridge ? (
                <View style={{ marginBottom: 14 }}>
                  <TouchableOpacity
                    style={styles.addFridgeBtn}
                    onPress={() => setShowAddFridge((v) => !v)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.addFridgeBtnText}>
                      {showAddFridge ? 'Close' : '+ Add a fridge'}
                    </Text>
                  </TouchableOpacity>
                  {showAddFridge ? (
                    <AddFridgeForm
                      chapters={chapters}
                      onCreated={async () => {
                        setShowAddFridge(false);
                        await reloadFridges();
                        notify('Fridge added', 'It will appear on the map within a few seconds.');
                      }}
                    />
                  ) : null}
                </View>
              ) : null}

              {fridgeView === 'map' && Platform.OS === 'web' ? (
                <FridgeLeafletMap fridges={fridges} userLocation={userLocation} height={580} />
              ) : (
                <FridgeListView fridges={fridges} userLocation={userLocation} />
              )}
            </View>
          )}
        </View>

        {/* Gap recruiting rail — surfaces the same call-to-action the
            old ImpactMap had, so anyone hovering a high-insecurity
            state can immediately email us to start a chapter. */}
        {tab === 'insecurity' ? (
          <View style={{ marginTop: 28 }}>
            <Text style={styles.sectionTitle}>The gap — cities ready for a chapter</Text>
            <View style={styles.gapGrid}>
              {gaps.map((g) => (
                <View key={`${g.city}-${g.state}`} style={styles.gapCard}>
                  <Text style={styles.gapCity}>{g.city}</Text>
                  <Text style={styles.gapState}>{g.state} · {g.insecurity}% food insecure</Text>
                  <TouchableOpacity style={styles.gapCta} onPress={() => startChapter(g.city, g.state)}>
                    <Text style={styles.gapCtaText}>Start a chapter →</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </ResponsiveContainer>
    </Screen>
  );
}

// Geocode a free-text address via OSM's Nominatim. Best-effort; if
// it 429s we still save the fridge — exec can edit lat/lng later.
async function geocodeAddress(address) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    if (!res.ok) return null;
    const json = await res.json();
    if (!Array.isArray(json) || !json.length) return null;
    const r = json[0];
    return { lat: parseFloat(r.lat), lng: parseFloat(r.lon) };
  } catch { return null; }
}

function AddFridgeForm({ chapters, onCreated }) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [hours, setHours] = useState('Open 24/7');
  const [capacity, setCapacity] = useState('medium');
  const [chapterId, setChapterId] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!name.trim() || !address.trim() || !city.trim()) {
      notify('Required', 'Name, address, and city are required.');
      return;
    }
    setBusy(true);
    try {
      const fullAddr = `${address.trim()}, ${city.trim()}${state.trim() ? ', ' + state.trim() : ''}`;
      const coords = await geocodeAddress(fullAddr);
      await createFridge({
        name: name.trim(),
        address: fullAddr,
        city: city.trim(),
        state: state.trim() || null,
        hours: hours.trim() || null,
        capacity,
        chapter_id: chapterId || null,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
        active: true,
      });
      onCreated && onCreated();
    } catch (e) {
      notify('Could not save', e?.message || 'Try again.');
    } finally { setBusy(false); }
  }

  return (
    <View style={styles.fridgeForm}>
      <Text style={styles.formHeading}>New community fridge</Text>
      <TextInput style={styles.input} placeholder="Fridge name (e.g. Cooper-Young Fridge)" value={name} onChangeText={setName} placeholderTextColor={Colors.grayMid} />
      <TextInput style={styles.input} placeholder="Street address" value={address} onChangeText={setAddress} placeholderTextColor={Colors.grayMid} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput style={[styles.input, { flex: 2 }]} placeholder="City" value={city} onChangeText={setCity} placeholderTextColor={Colors.grayMid} />
        <TextInput style={[styles.input, { flex: 1 }]} placeholder="State / region" value={state} onChangeText={setState} placeholderTextColor={Colors.grayMid} />
      </View>
      <TextInput style={styles.input} placeholder="Hours (e.g. 7am – 9pm)" value={hours} onChangeText={setHours} placeholderTextColor={Colors.grayMid} />

      <Text style={styles.formLabel}>Chapter</Text>
      <View style={styles.chipRow}>
        {chapters.map((c) => {
          const active = c.id === chapterId;
          return (
            <TouchableOpacity key={c.id} onPress={() => setChapterId(c.id)} style={[styles.chip, active && styles.chipActive]} activeOpacity={0.85}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{c.name || c.city}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.formLabel}>Capacity</Text>
      <View style={styles.chipRow}>
        {['low', 'medium', 'high'].map((k) => {
          const active = capacity === k;
          return (
            <TouchableOpacity key={k} onPress={() => setCapacity(k)} style={[styles.chip, active && styles.chipActive]} activeOpacity={0.85}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{k}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Button title={busy ? 'Saving…' : 'Save fridge'} onPress={submit} loading={busy} style={{ marginTop: 12 }} />
      <Text style={styles.formNote}>
        We'll geocode the address automatically. If we can't find it, the fridge still saves and you can fix the coordinates later in Settings.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  headerRow: { marginBottom: 8 },
  back: { fontSize: 16, color: Colors.green },
  eyebrow: { ...Type.caption, color: Colors.pink, letterSpacing: 1.2, textTransform: 'uppercase', marginTop: 8, marginBottom: 6 },
  title: { color: Colors.green, fontSize: 40, marginBottom: 8 },
  body: { ...Type.body, color: Colors.gray, lineHeight: 22, marginBottom: 18 },

  tabs: { flexDirection: 'row', backgroundColor: Colors.white, borderRadius: Radius.pill, padding: 4, alignSelf: 'flex-start', marginBottom: 18, borderWidth: 1, borderColor: Colors.glassBorder },
  tab: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: Radius.pill },
  tabActive: { backgroundColor: Colors.green },
  tabText: { fontSize: 13, fontWeight: '700', color: Colors.gray, letterSpacing: 0.3 },
  tabTextActive: { color: '#FFF' },

  surface: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: Platform.OS === 'web' ? 18 : 12,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    ...Shadows.card,
  },

  sectionTitle: { fontSize: 16, fontWeight: '800', color: Colors.green, marginBottom: 12 },
  gapGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  gapCard: {
    flexGrow: 1, flexBasis: 220, minWidth: 220,
    backgroundColor: Colors.white, borderRadius: Radius.xl, padding: 16,
    borderLeftWidth: 4, borderLeftColor: Colors.pink,
    borderWidth: 1, borderColor: Colors.glassBorder,
    ...Shadows.card,
  },
  gapCity: { fontSize: 17, fontWeight: '800', color: Colors.green },
  gapState: { fontSize: 12, color: Colors.grayMid, marginTop: 2 },
  gapCta: { marginTop: 12, backgroundColor: Colors.pink, paddingVertical: 10, borderRadius: Radius.pill, alignItems: 'center' },
  gapCtaText: { color: '#FFF', fontWeight: '700', fontSize: 13 },

  subToggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' },
  subToggle: { flexDirection: 'row', backgroundColor: '#F7F5EF', borderRadius: Radius.pill, padding: 4 },
  subTab: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: Radius.pill },
  subTabActive: { backgroundColor: Colors.white, ...Shadows.card },
  subTabText: { fontSize: 12, fontWeight: '700', color: Colors.gray, letterSpacing: 0.3 },
  subTabTextActive: { color: Colors.green },
  locateBtn: { backgroundColor: Colors.green, paddingVertical: 9, paddingHorizontal: 14, borderRadius: Radius.pill },
  locateBtnText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  locateState: { ...Type.caption, color: Colors.grayMid },
  locateStateOn: { fontSize: 12, color: Colors.green, fontWeight: '700' },

  addFridgeBtn: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.green,
    paddingVertical: 10, paddingHorizontal: 16,
    borderRadius: Radius.pill,
  },
  addFridgeBtnText: { color: '#FFF', fontWeight: '700', fontSize: 13 },

  fridgeForm: {
    marginTop: 12,
    backgroundColor: '#F7F5EF',
    borderRadius: Radius.lg,
    padding: 16,
    borderWidth: 1, borderColor: Colors.glassBorder,
  },
  formHeading: { fontSize: 16, fontWeight: '800', color: Colors.green, marginBottom: 10 },
  input: {
    backgroundColor: '#FFF',
    borderRadius: 10,
    borderWidth: 1, borderColor: Colors.glassBorder,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: Colors.dark,
    marginBottom: 8,
  },
  formLabel: { fontSize: 12, fontWeight: '700', color: Colors.gray, marginTop: 6, marginBottom: 6, letterSpacing: 0.4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: Radius.pill, backgroundColor: '#FFF', borderWidth: 1, borderColor: Colors.glassBorder },
  chipActive: { backgroundColor: Colors.green, borderColor: Colors.green },
  chipText: { fontSize: 12, fontWeight: '600', color: Colors.dark },
  chipTextActive: { color: '#FFF' },
  formNote: { ...Type.caption, color: Colors.grayMid, marginTop: 8, lineHeight: 16 },
});
