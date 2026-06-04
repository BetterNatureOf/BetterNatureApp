// Manage Chapters — exec-level view of every BetterNature chapter
// worldwide. Lets an exec create a chapter, edit/deactivate it, see
// its full roster grouped by leadership tier, and inspect live
// stats (members / fridges / events / meals / hours).
//
// Chapter docs go in the `chapters` Firestore collection with this
// shape (also consumed by betternatureofficial.org):
//
//   chapters/{id} = {
//     name, city, state, country (ISO3), description,
//     status: 'active' | 'inactive',
//     founded_at: serverTimestamp(),
//     created_at: serverTimestamp(),
//   }
//
// Members reference a chapter via users/{uid}.chapter_id.
// Fridges reference via fridges/{id}.chapter_id.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Modal, TextInput, Alert, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import Button from '../../components/ui/Button';
import ResponsiveContainer from '../../components/ui/ResponsiveContainer';
import Screen from '../../components/ui/Screen';
import {
  fetchChapters, createChapter, updateChapter,
  fetchAllMembers, fetchEvents, fetchPickups,
} from '../../services/database';
import { listFridges } from '../../services/fridges';
import { notify } from '../../services/ui';

const LEAD_ROLES = [
  { key: 'chapter_president', label: 'President' },
  { key: 'chapter_pres',      label: 'President' },
  { key: 'chapter_vp',        label: 'Vice President' },
  { key: 'chapter_sec',       label: 'Secretary' },
  { key: 'chapter_treas',     label: 'Treasurer' },
];

function isLead(role) {
  return LEAD_ROLES.some((r) => r.key === role);
}

function labelForRole(role) {
  const m = LEAD_ROLES.find((r) => r.key === role);
  return m ? m.label : 'Member';
}

export default function ManageChapters({ navigation }) {
  const [chapters, setChapters]   = useState([]);
  const [members, setMembers]     = useState([]);
  const [fridges, setFridges]     = useState([]);
  const [pickups, setPickups]     = useState([]);
  const [events, setEvents]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [expanded, setExpanded]   = useState(null);
  const [showAdd, setShowAdd]     = useState(false);
  const [editing, setEditing]     = useState(null);
  const [saving, setSaving]       = useState(false);

  const blankForm = { name: '', city: '', state: '', country: 'USA', description: '' };
  const [form, setForm] = useState(blankForm);

  const load = useCallback(async () => {
    // Run each fetch in isolation so one failure (e.g. a permission
    // denial on /pickups for a brand-new exec) doesn't black-hole the
    // entire chapter list.
    const safe = (p, fallback) => p.then((v) => v).catch((e) => {
      console.warn('ManageChapters fetch failed', e);
      return fallback;
    });
    const [c, m, f, ev, pk] = await Promise.all([
      safe(fetchChapters(), []),
      safe(fetchAllMembers(), []),
      safe(listFridges(), []),
      safe(fetchEvents(), []),
      safe(fetchPickups(), []),
    ]);
    setChapters(c);
    setMembers(m);
    setFridges(f);
    setEvents(ev);
    setPickups(pk);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Whenever the loaded chapter/members data shows that a chapter's
  // denormalized fields (president_name, member_count) are stale, push
  // the corrected values back to Firestore. The website renders straight
  // off these fields, so this keeps "Find your chapter" honest without
  // requiring the marketing site to do a join.
  useEffect(() => {
    if (!chapters.length || !members.length) return;
    chapters.forEach(async (ch) => {
      const inChapter = members.filter((u) => u.chapter_id === ch.id && (u.role || 'member') !== 'restaurant');
      const pres = inChapter.find((u) => u.role === 'chapter_president' || u.role === 'chapter_pres');
      const nextPres = pres?.name || '';
      const nextCount = inChapter.length;
      if (ch.president_name !== nextPres || ch.member_count !== nextCount) {
        try {
          await updateChapter(ch.id, { president_name: nextPres, member_count: nextCount });
        } catch {}
      }
    });
  }, [chapters, members]);

  // Per-chapter roll-ups computed once when any source changes.
  const rollup = useMemo(() => {
    const result = {};
    chapters.forEach((ch) => {
      const chapterMembers = members.filter((u) => u.chapter_id === ch.id && (u.role || 'member') !== 'restaurant');
      const chapterFridges = fridges.filter((f) => f.chapter_id === ch.id);
      const chapterEvents  = events.filter((e) => e.chapter_id === ch.id);
      const chapterPickups = pickups.filter((p) => p.chapter_id === ch.id);

      const meals = chapterMembers.reduce((s, u) => s + (u.meals_rescued || 0), 0);
      const hours = chapterMembers.reduce((s, u) => s + (u.hours_logged || 0), 0);
      const eventsAttended = chapterMembers.reduce((s, u) => s + (u.events_attended || 0), 0);

      // Group team
      const leadership = LEAD_ROLES.map((r) => ({
        role: r,
        person: chapterMembers.find((m) => m.role === r.key),
      })).filter((row) => row.person);

      // De-dupe presidents (chapter_pres + chapter_president collide)
      const seen = new Set();
      const team = [];
      leadership.forEach((row) => {
        if (seen.has(row.person.id)) return;
        seen.add(row.person.id);
        team.push(row);
      });

      const roster = chapterMembers.filter((m) => !isLead(m.role));

      result[ch.id] = {
        membersCount: chapterMembers.length,
        fridgesCount: chapterFridges.length,
        eventsCount: chapterEvents.length,
        pickupsCount: chapterPickups.length,
        meals,
        hours,
        eventsAttended,
        team,
        roster,
        fridges: chapterFridges,
      };
    });
    return result;
  }, [chapters, members, fridges, events, pickups]);

  function openAdd() {
    setForm(blankForm);
    setEditing(null);
    setShowAdd(true);
  }

  function openEdit(ch) {
    setForm({
      name: ch.name || '',
      city: ch.city || '',
      state: ch.state || '',
      country: ch.country || 'USA',
      description: ch.description || '',
    });
    setEditing(ch);
    setShowAdd(true);
  }

  async function handleSave() {
    if (!form.name.trim() || !form.city.trim()) {
      notify('Required', 'Chapter name and city are required.');
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      city: form.city.trim(),
      state: form.state.trim(),
      country: (form.country || 'USA').toUpperCase(),
      description: form.description.trim(),
    };
    try {
      if (editing) {
        await updateChapter(editing.id, payload);
      } else {
        // status: 'active' so the website map shows the new pin
        // immediately (the marketing site filters by status).
        await createChapter({
          ...payload,
          status: 'active',
          founded_at: new Date().toISOString(),
          // The website's "Find your chapter" card reads these
          // denormalized fields directly. We refresh them whenever
          // the president changes — see refreshPresidentName().
          president_name: '',
          member_count: 0,
        });
      }
      setShowAdd(false);
      setSaving(false);
      // Wait for the load() so the new card is on screen before the
      // user looks again. Errors here are non-fatal.
      await load();
      notify(editing ? 'Saved' : 'Chapter created', editing
        ? 'Your changes are live on the website.'
        : 'It now appears on the website and the app map.');
    } catch (e) {
      setSaving(false);
      // Common case: rules denial because the user isn't classified
      // as 'executive' in their profile. Surface the actual error.
      const code = e?.code || '';
      const msg = e?.message || 'Try again.';
      const help = code.includes('permission-denied')
        ? '\n\nThis usually means your account isn\'t marked as executive in Firestore. Open Manage Members → tap your name → set role to Executive.'
        : '';
      notify('Could not save', msg + help);
    }
  }

  async function toggleStatus(chapter) {
    const next = chapter.status === 'inactive' ? 'active' : 'inactive';
    Alert.alert(
      next === 'active' ? 'Reactivate chapter?' : 'Deactivate chapter?',
      next === 'inactive'
        ? `${chapter.name} will be hidden from the website map and member signup. Members keep their accounts.`
        : `${chapter.name} will appear publicly again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', onPress: async () => { await updateChapter(chapter.id, { status: next }); load(); } },
      ]
    );
  }

  return (
    <Screen contentStyle={styles.content}>
      <ResponsiveContainer maxWidth={1100}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>

        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <BrushText variant="screenTitle" style={styles.title}>Manage Chapters</BrushText>
            <Text style={styles.subtitle}>
              {chapters.length} {chapters.length === 1 ? 'chapter' : 'chapters'} · {members.filter((m) => m.role !== 'restaurant').length} members · {fridges.length} fridges
            </Text>
          </View>
          <TouchableOpacity style={styles.addBtn} onPress={openAdd}>
            <Text style={styles.addBtnText}>+ Add chapter</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <Text style={styles.empty}>Loading…</Text>
        ) : chapters.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No chapters yet</Text>
            <Text style={styles.emptyBody}>Tap “Add chapter” to start the first one. New chapters appear on the website map immediately.</Text>
          </View>
        ) : (
          chapters.map((ch) => {
            const r = rollup[ch.id] || {};
            const isOpen = expanded === ch.id;
            return (
              <View key={ch.id} style={styles.card}>
                <TouchableOpacity onPress={() => setExpanded(isOpen ? null : ch.id)} activeOpacity={0.85} style={styles.cardHead}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{ch.name}</Text>
                    <Text style={styles.cardLoc}>
                      {[ch.city, ch.state, ch.country].filter(Boolean).join(', ')}
                    </Text>
                  </View>
                  <View style={[styles.statusPill, ch.status === 'inactive' && styles.statusPillOff]}>
                    <Text style={[styles.statusPillText, ch.status === 'inactive' && styles.statusPillTextOff]}>
                      {ch.status || 'active'}
                    </Text>
                  </View>
                  <Text style={styles.chev}>{isOpen ? '▾' : '›'}</Text>
                </TouchableOpacity>

                {/* Stats strip (always visible) */}
                <View style={styles.statsStrip}>
                  <Stat n={r.membersCount} l="members" />
                  <Stat n={r.fridgesCount} l="fridges" />
                  <Stat n={r.eventsCount}  l="events"  />
                  <Stat n={r.meals}        l="meals"   />
                  <Stat n={`${r.hours || 0}h`} l="hours" />
                </View>

                {isOpen ? (
                  <View style={styles.expanded}>
                    {/* Main team */}
                    <Text style={styles.sectionLabel}>Main team</Text>
                    {(!r.team || r.team.length === 0) ? (
                      <Text style={styles.muted}>No officers assigned yet.</Text>
                    ) : (
                      <View style={styles.teamGrid}>
                        {r.team.map(({ role, person }) => (
                          <View key={person.id + role.key} style={styles.teamCard}>
                            <Text style={styles.teamRole}>{role.label}</Text>
                            <Text style={styles.teamName}>{person.name || '(unnamed)'}</Text>
                            <Text style={styles.teamMeta}>{person.email}</Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {/* Roster */}
                    <Text style={styles.sectionLabel}>Roster ({r.roster?.length || 0})</Text>
                    {(!r.roster || r.roster.length === 0) ? (
                      <Text style={styles.muted}>No general members assigned to this chapter yet.</Text>
                    ) : (
                      r.roster.map((m) => (
                        <View key={m.id} style={styles.rosterRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.rosterName}>{m.name || '(unnamed)'}</Text>
                            <Text style={styles.rosterMeta}>{m.email} · {labelForRole(m.role)}</Text>
                          </View>
                          <Text style={styles.rosterStat}>{m.events_attended || 0} ev · {m.meals_rescued || 0} m · {m.hours_logged || 0}h</Text>
                        </View>
                      ))
                    )}

                    {/* Fridges */}
                    <Text style={styles.sectionLabel}>Fridges ({r.fridges?.length || 0})</Text>
                    {(!r.fridges || r.fridges.length === 0) ? (
                      <Text style={styles.muted}>No fridges registered to this chapter yet.</Text>
                    ) : (
                      r.fridges.map((f) => (
                        <View key={f.id} style={styles.fridgeRow}>
                          <Text style={styles.fridgeName}>{f.name}</Text>
                          <Text style={styles.fridgeMeta}>{f.address || `${f.city || ''}${f.state ? ', ' + f.state : ''}`}</Text>
                        </View>
                      ))
                    )}

                    {/* Actions */}
                    <View style={styles.actionRow}>
                      <Button title="Edit chapter" variant="secondary" onPress={() => openEdit(ch)} style={{ flex: 1 }} />
                      <Button
                        title={ch.status === 'inactive' ? 'Reactivate' : 'Deactivate'}
                        onPress={() => toggleStatus(ch)}
                        style={{ flex: 1 }}
                      />
                    </View>
                  </View>
                ) : null}
              </View>
            );
          })
        )}

        {/* Add / Edit modal */}
        <Modal visible={showAdd} transparent animationType="fade" onRequestClose={() => setShowAdd(false)}>
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>{editing ? 'Edit chapter' : 'Add a chapter'}</Text>
              <Text style={styles.modalHelp}>
                New chapters appear on the website map at betternatureofficial.org immediately after saving.
              </Text>

              <Text style={styles.fieldLabel}>Chapter name *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Memphis"
                value={form.name}
                onChangeText={(v) => setForm((p) => ({ ...p, name: v }))}
              />

              <View style={styles.modalRow2}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>City *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Memphis"
                    value={form.city}
                    onChangeText={(v) => setForm((p) => ({ ...p, city: v }))}
                  />
                </View>
                <View style={{ width: 110 }}>
                  <Text style={styles.fieldLabel}>State/Region</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="TN"
                    value={form.state}
                    onChangeText={(v) => setForm((p) => ({ ...p, state: v }))}
                  />
                </View>
                <View style={{ width: 80 }}>
                  <Text style={styles.fieldLabel}>Country</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="USA"
                    autoCapitalize="characters"
                    maxLength={3}
                    value={form.country}
                    onChangeText={(v) => setForm((p) => ({ ...p, country: v }))}
                  />
                </View>
              </View>

              <Text style={styles.fieldLabel}>Description (optional)</Text>
              <TextInput
                style={[styles.input, { minHeight: 70, textAlignVertical: 'top' }]}
                multiline
                placeholder="One-paragraph summary that appears on the website."
                value={form.description}
                onChangeText={(v) => setForm((p) => ({ ...p, description: v }))}
              />

              <View style={styles.modalActions}>
                <Button title="Cancel" variant="secondary" onPress={() => setShowAdd(false)} style={{ flex: 1, marginRight: 6 }} />
                <Button title={editing ? 'Save changes' : 'Create chapter'} onPress={handleSave} loading={saving} style={{ flex: 1, marginLeft: 6 }} />
              </View>
            </View>
          </View>
        </Modal>
      </ResponsiveContainer>
    </Screen>
  );
}

function Stat({ n, l }) {
  return (
    <View style={styles.statBox}>
      <Text style={styles.statN}>{n ?? 0}</Text>
      <Text style={styles.statL}>{l}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream, ...(Platform.OS === 'web' ? { height: '100vh' } : null) },
  content: { padding: 24, paddingTop: 60, paddingBottom: 60 },
  back: { fontSize: 16, color: Colors.green, marginBottom: 8 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 20, flexWrap: 'wrap' },
  title: { color: Colors.green, marginBottom: 6 },
  subtitle: { ...Type.body, color: Colors.gray },
  addBtn: { backgroundColor: Colors.green, paddingVertical: 12, paddingHorizontal: 18, borderRadius: Radius.pill, alignSelf: 'flex-start' },
  addBtnText: { color: '#FFF', fontWeight: '800', fontSize: 14 },

  empty: { ...Type.body, color: Colors.gray, marginTop: 20, textAlign: 'center' },
  emptyCard: { backgroundColor: Colors.white, borderRadius: Radius.xl, padding: 24, alignItems: 'center', ...Shadows.card },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: Colors.green, marginBottom: 4 },
  emptyBody: { ...Type.body, color: Colors.gray, textAlign: 'center' },

  card: { backgroundColor: Colors.white, borderRadius: Radius.xl, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: Colors.glassBorder, ...Shadows.card },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardTitle: { fontSize: 17, fontWeight: '800', color: Colors.dark },
  cardLoc: { ...Type.caption, marginTop: 2 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: '#E8F5EE' },
  statusPillOff: { backgroundColor: '#FFE4E6' },
  statusPillText: { fontSize: 11, fontWeight: '800', color: Colors.green, textTransform: 'uppercase', letterSpacing: 0.8 },
  statusPillTextOff: { color: Colors.pink },
  chev: { fontSize: 22, color: Colors.grayMid, marginLeft: 4 },

  statsStrip: { flexDirection: 'row', gap: 6, marginTop: 12, flexWrap: 'wrap' },
  statBox: { flexGrow: 1, flexBasis: 80, minWidth: 64, backgroundColor: '#F7F5EF', paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  statN: { fontSize: 17, fontWeight: '800', color: Colors.green },
  statL: { ...Type.caption, marginTop: 2, fontWeight: '600' },

  expanded: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: Colors.grayLight, gap: 6 },
  sectionLabel: { fontSize: 12, fontWeight: '800', color: Colors.green, marginTop: 12, marginBottom: 6, letterSpacing: 0.6, textTransform: 'uppercase' },
  muted: { ...Type.caption, color: Colors.grayMid, fontStyle: 'italic' },

  teamGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  teamCard: { flexGrow: 1, flexBasis: 180, minWidth: 160, backgroundColor: '#F7F5EF', borderRadius: 12, padding: 12 },
  teamRole: { fontSize: 11, fontWeight: '800', color: Colors.pink, letterSpacing: 0.6, textTransform: 'uppercase' },
  teamName: { fontSize: 15, fontWeight: '700', color: Colors.dark, marginTop: 2 },
  teamMeta: { ...Type.caption, marginTop: 2 },

  rosterRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.grayLight },
  rosterName: { fontSize: 14, fontWeight: '700', color: Colors.dark },
  rosterMeta: { ...Type.caption, marginTop: 2 },
  rosterStat: { fontSize: 11, color: Colors.gray, fontWeight: '700' },

  fridgeRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.grayLight },
  fridgeName: { fontSize: 14, fontWeight: '700', color: Colors.dark },
  fridgeMeta: { ...Type.caption, marginTop: 2 },

  actionRow: { flexDirection: 'row', gap: 10, marginTop: 14 },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15,28,21,0.45)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalCard: { width: '100%', maxWidth: 540, backgroundColor: Colors.white, borderRadius: Radius.xl, padding: 22 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: Colors.green },
  modalHelp: { ...Type.caption, marginTop: 4, marginBottom: 14 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: Colors.gray, marginTop: 12, marginBottom: 4, letterSpacing: 0.4, textTransform: 'uppercase' },
  input: { borderWidth: 1, borderColor: Colors.glassBorder, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: Colors.dark, backgroundColor: '#FAF8F1' },
  modalRow2: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  modalActions: { flexDirection: 'row', marginTop: 18 },
});
