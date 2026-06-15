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
  fetchChapters, fetchAllChapters, createChapter, updateChapter, deleteChapter,
  fetchAllMembers, fetchEvents, fetchPickups,
} from '../../services/database';
import { listFridges } from '../../services/fridges';
import { updateProfile } from '../../services/auth';
import { notify, confirm } from '../../services/ui';
import { confirmWithPassword } from '../../services/passwordConfirm';
import { selfPromoteToExecutive, isFounderEmail } from '../../services/founder';
import { getProfile } from '../../services/auth';
import useAuthStore from '../../store/authStore';
import ChapterApprovals from './ChapterApprovals';

// Officer slots, in display order. chapter_pres kept as an alias for
// chapter_president since older accounts used the short form.
const OFFICER_SLOTS = [
  { key: 'chapter_president',  label: 'President' },
  { key: 'chapter_vp',         label: 'Vice President' },
  { key: 'chapter_treas',      label: 'Treasurer' },
  { key: 'chapter_vol_coord',  label: 'Volunteer Coordinator' },
  { key: 'chapter_sec',        label: 'Secretary' },
];
const LEAD_KEYS = new Set([
  'chapter_president', 'chapter_pres', 'chapter_vp',
  'chapter_treas', 'chapter_vol_coord', 'chapter_sec',
]);

function isLead(role) { return LEAD_KEYS.has(role); }

function labelForRole(role) {
  if (role === 'chapter_pres' || role === 'chapter_president') return 'President';
  if (role === 'chapter_vp') return 'Vice President';
  if (role === 'chapter_treas') return 'Treasurer';
  if (role === 'chapter_vol_coord') return 'Volunteer Coordinator';
  if (role === 'chapter_sec') return 'Secretary';
  return 'Member';
}

export default function ManageChapters({ navigation }) {
  const authUser = useAuthStore((s) => s.user);
  const setAuthUser = useAuthStore((s) => s.setUser);
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

  const blankForm = { city: '', state: '', country: 'USA', description: '' };
  const [form, setForm] = useState(blankForm);
  const [needsPromote, setNeedsPromote] = useState(false);
  const [promoting, setPromoting] = useState(false);

  const load = useCallback(async () => {
    // Run each fetch in isolation so one failure (e.g. a permission
    // denial on /pickups for a brand-new exec) doesn't black-hole the
    // entire chapter list.
    const safe = (p, fallback) => p.then((v) => v).catch((e) => {
      console.warn('ManageChapters fetch failed', e);
      return fallback;
    });
    const [c, m, f, ev, pk] = await Promise.all([
      safe(fetchAllChapters(), []),
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

  // Surface the upgrade prompt the moment the screen loads if the
  // signed-in user isn't already an executive/admin — so they fix
  // their role before filling out a doomed form.
  useEffect(() => {
    const role = (authUser?.role || 'member').toLowerCase();
    const okRoles = new Set(['executive', 'admin', 'super_admin']);
    // Only founders ever see the self-upgrade banner. Regular
    // members cannot promote themselves to executive even via the
    // direct rule path; we gate the UI on email so this isn't even
    // discoverable.
    const isFounder = isFounderEmail(authUser?.email);
    setNeedsPromote(isFounder && !okRoles.has(role));
  }, [authUser?.role, authUser?.email]);

  // Assign a chapter member to a specific officer slot. Demotes
  // anyone who already had that slot. Writes go to the user docs;
  // the auto-sync useEffect on chapters+members re-denormalizes
  // officers onto the chapter doc.
  async function assignOfficer(chapter, person, slotKey) {
    if (!person?.id) return;
    try {
      // Demote any current holder of this slot.
      const current = members.find((u) =>
        u.chapter_id === chapter.id
        && (u.role === slotKey || (slotKey === 'chapter_president' && u.role === 'chapter_pres'))
      );
      if (current && current.id !== person.id) {
        await updateProfile(current.id, { role: 'member' });
      }
      await updateProfile(person.id, { role: slotKey });
      load();
      notify('Officer updated', `${person.name || 'Member'} is now ${labelForRole(slotKey)} of ${chapter.name}.`);
    } catch (e) {
      notify('Could not assign', e?.message || 'Try again.');
    }
  }
  async function clearOfficer(chapter, slotKey, team) {
    const slot = (team || []).find((t) => t.role.key === slotKey);
    if (!slot?.person) return;
    try {
      await updateProfile(slot.person.id, { role: 'member' });
      load();
      notify('Officer cleared', `${slot.person.name || 'Member'} is no longer ${labelForRole(slotKey)}.`);
    } catch (e) {
      notify('Could not clear', e?.message || 'Try again.');
    }
  }

  async function handlePromoteNow() {
    if (!authUser?.id) return;
    setPromoting(true);
    try {
      await selfPromoteToExecutive(authUser.id);
      const fresh = await getProfile(authUser.id);
      if (fresh && setAuthUser) setAuthUser(fresh);
      setNeedsPromote(false);
      notify('Done', "You're now an Executive. Tap Add chapter again.");
    } catch (e) {
      notify('Could not upgrade', e?.message || 'Sign out, sign back in, and try again.');
    } finally { setPromoting(false); }
  }

  // Whenever the loaded chapter/members data shows that a chapter's
  // denormalized fields (president_name, member_count) are stale, push
  // the corrected values back to Firestore. The website renders straight
  // off these fields, so this keeps "Find your chapter" honest without
  // requiring the marketing site to do a join.
  useEffect(() => {
    if (!chapters.length || !members.length) return;
    chapters.forEach(async (ch) => {
      const inChapter = members.filter((u) => u.chapter_id === ch.id && (u.role || 'member') !== 'restaurant');
      const pres   = inChapter.find((u) => u.role === 'chapter_president' || u.role === 'chapter_pres');
      const vp     = inChapter.find((u) => u.role === 'chapter_vp');
      const sec    = inChapter.find((u) => u.role === 'chapter_sec');
      const tres   = inChapter.find((u) => u.role === 'chapter_treas');
      const volCo  = inChapter.find((u) => u.role === 'chapter_vol_coord');
      // Shape officers as plain { name, email } objects so the
      // marketing site can render them without parsing.
      const nextOfficers = {
        president:             pres  ? { name: pres.name  || '', email: pres.email  || '' } : null,
        vice_president:        vp    ? { name: vp.name    || '', email: vp.email    || '' } : null,
        treasurer:             tres  ? { name: tres.name  || '', email: tres.email  || '' } : null,
        volunteer_coordinator: volCo ? { name: volCo.name || '', email: volCo.email || '' } : null,
        secretary:             sec   ? { name: sec.name   || '', email: sec.email   || '' } : null,
      };
      const nextPres = pres?.name || '';
      const nextCount = inChapter.length;
      // Cheap diff: stringify the officers blob so a name typo
      // change triggers the sync too.
      const officersStr = JSON.stringify(nextOfficers);
      const prevOfficersStr = JSON.stringify(ch.officers || {});
      if (
        ch.president_name !== nextPres ||
        ch.member_count !== nextCount ||
        officersStr !== prevOfficersStr
      ) {
        try {
          await updateChapter(ch.id, {
            president_name: nextPres,
            member_count: nextCount,
            officers: nextOfficers,
          });
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

      const lbs = chapterMembers.reduce((s, u) => s + (u.lbs_rescued || Math.round((u.meals_rescued || 0) / 1.2)), 0);
      const hours = chapterMembers.reduce((s, u) => s + (u.hours_logged || 0), 0);
      const eventsAttended = chapterMembers.reduce((s, u) => s + (u.events_attended || 0), 0);

      // Officer slot → person (or null). Presidents tolerate either
      // legacy 'chapter_pres' or current 'chapter_president'.
      const team = OFFICER_SLOTS.map((slot) => {
        const person = slot.key === 'chapter_president'
          ? chapterMembers.find((m) => m.role === 'chapter_president' || m.role === 'chapter_pres')
          : chapterMembers.find((m) => m.role === slot.key);
        return { role: slot, person };
      });
      // Roster shows EVERY chapter member — including the president
      // and other officers. The Team section above still highlights
      // them in the leadership tier, but they belong on the member
      // roster too (they signed up like everyone else and show up
      // for pickups). Showing them in both places makes counts
      // honest and lets the pres click into their own profile.
      const roster = chapterMembers;

      result[ch.id] = {
        membersCount: chapterMembers.length,
        fridgesCount: chapterFridges.length,
        eventsCount: chapterEvents.length,
        pickupsCount: chapterPickups.length,
        lbs,
        hours,
        eventsAttended,
        team,
        roster,
        fridges: chapterFridges,
      };
    });
    return result;
  }, [chapters, members, fridges, events, pickups]);

  // Chapter names follow one format only: "BetterNature {City}".
  // We derive it from the city field at save time so the format is
  // never wrong and the exec doesn't have to retype it.
  function chapterNameFor(city) {
    const c = (city || '').trim();
    return c ? `BetterNature ${c}` : '';
  }

  function openAdd() {
    setForm(blankForm);
    setEditing(null);
    setShowAdd(true);
  }

  function openEdit(ch) {
    setForm({
      city: ch.city || '',
      state: ch.state || '',
      country: ch.country || 'USA',
      description: ch.description || '',
    });
    setEditing(ch);
    setShowAdd(true);
  }

  async function attemptSave(payload) {
    if (editing) return updateChapter(editing.id, payload);
    return createChapter({
      ...payload,
      status: 'active',
      founded_at: new Date().toISOString(),
      // Denormalized fields the marketing site reads directly so it
      // doesn't have to join to the users collection.
      president_name: '',
      member_count: 0,
    });
  }

  async function handleSave() {
    if (!form.city.trim()) {
      notify('Required', 'City is required.');
      return;
    }
    setSaving(true);
    const payload = {
      name: chapterNameFor(form.city),
      city: form.city.trim(),
      state: form.state.trim(),
      country: (form.country || 'USA').toUpperCase(),
      description: form.description.trim(),
    };
    const finishOk = async () => {
      setShowAdd(false);
      setSaving(false);
      await load();
      notify(editing ? 'Saved' : 'Chapter created', editing
        ? 'Your changes are live on the website.'
        : 'It now appears on the website and the app map.');
    };

    try {
      await attemptSave(payload);
      await finishOk();
    } catch (e) {
      const code = (e?.code || '').toLowerCase();
      const msg = e?.message || 'Try again.';
      const isPerm = code.includes('permission-denied') || msg.toLowerCase().includes('missing or insufficient');
      if (!isPerm) {
        setSaving(false);
        notify('Could not save', msg);
        return;
      }

      // Self-heal: offer to promote the signed-in user to executive
      // in-place (self-write is allowed by the Firestore rule). If
      // they accept, retry the save without re-opening the modal.
      const ok = await confirm(
        'You don\'t have executive permission yet',
        'BetterNature chapters can only be created by executives. Promote your account to Executive and retry?'
      );
      if (!ok) { setSaving(false); return; }
      try {
        await selfPromoteToExecutive(authUser?.id);
        // Refresh in-memory profile so the rest of the app sees the
        // new role immediately (the Org tab, ContractGate, etc.).
        const fresh = await getProfile(authUser?.id);
        if (fresh && setAuthUser) setAuthUser(fresh);
      } catch (promoteErr) {
        setSaving(false);
        notify('Could not upgrade role', promoteErr?.message || 'Sign out, sign back in, and try again.');
        return;
      }
      // Retry the save with the new role in place.
      try {
        await attemptSave(payload);
        await finishOk();
      } catch (retryErr) {
        setSaving(false);
        notify('Still couldn\'t save', retryErr?.message || 'Try again in a moment.');
      }
    }
  }

  async function handleDelete(chapter) {
    const ok = await confirmWithPassword(
      `Delete ${chapter.name}?`,
      'This removes the chapter from Firestore permanently — Manage Chapters, the website, the BN Map, and Find Chapter. Members keep their accounts but lose their chapter assignment. Use this only for test or mistaken creates; for real chapters, deactivate instead.',
      { confirmLabel: 'Delete forever', destructive: true }
    );
    if (!ok) return;
    try {
      await deleteChapter(chapter.id);
      load();
      notify('Chapter deleted', `${chapter.name} is gone for good.`);
    } catch (e) {
      notify('Could not delete', e?.message || 'Try again.');
    }
  }

  async function toggleStatus(chapter) {
    const next = chapter.status === 'inactive' ? 'active' : 'inactive';
    // Deactivation is destructive — gate it behind the user's
    // password. Reactivation is reversible, plain confirm is fine.
    const ok = next === 'inactive'
      ? await confirmWithPassword(
          `Deactivate ${chapter.name}?`,
          `${chapter.name} will be hidden from the website map and member signup. Members keep their accounts.`,
          { confirmLabel: 'Deactivate', destructive: true }
        )
      : await confirm('Reactivate chapter?', `${chapter.name} will appear publicly again.`);
    if (!ok) return;
    try {
      await updateChapter(chapter.id, { status: next });
      load();
      notify(next === 'inactive' ? 'Chapter deactivated' : 'Chapter reactivated', '');
    } catch (e) {
      notify('Could not update', e?.message || 'Try again.');
    }
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

        <ChapterApprovals onApproved={load} />

        {needsPromote ? (
          <View style={styles.promoteBanner}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={styles.promoteTitle}>Heads up — you're not Executive yet</Text>
              <Text style={styles.promoteBody}>
                Chapter creation is reserved for executives. Tap below to upgrade your own account; you can do this without an exec because Firestore lets you edit your own profile.
              </Text>
            </View>
            <Button title="Make me Executive" onPress={handlePromoteNow} loading={promoting} style={{ minWidth: 170 }} />
          </View>
        ) : null}

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
                  <Stat n={r.lbs}          l="lbs"    />
                  <Stat n={`${r.hours || 0}h`} l="hours" />
                </View>

                {isOpen ? (
                  <View style={styles.expanded}>
                    {/* Officer assignment. Each row is a slot with a
                        chip list of every chapter member; tapping a
                        chip writes that role to the picked user (and
                        clears it from whoever held it before). */}
                    <Text style={styles.sectionLabel}>Officers</Text>
                    {[...(r.roster || []), ...(r.team || []).map((t) => t.person).filter(Boolean)].length === 0 ? (
                      <Text style={styles.muted}>No one is in this chapter yet — assign members first, then come back here.</Text>
                    ) : (
                      <OfficerEditor
                        chapter={ch}
                        slots={OFFICER_SLOTS}
                        team={r.team}
                        members={[
                          ...(r.team || []).map((t) => t.person).filter(Boolean),
                          ...(r.roster || []),
                        ]}
                        onAssign={(person, slotKey) => assignOfficer(ch, person, slotKey)}
                        onClear={(slotKey) => clearOfficer(ch, slotKey, r.team)}
                      />
                    )}

                    {/* Roster */}
                    <Text style={styles.sectionLabel}>Roster ({r.roster?.length || 0})</Text>
                    {(!r.roster || r.roster.length === 0) ? (
                      <Text style={styles.muted}>No general members assigned to this chapter yet.</Text>
                    ) : (
                      r.roster.map((m) => (
                        <TouchableOpacity
                          key={m.id}
                          style={styles.rosterRow}
                          onPress={() => navigation.navigate('ManageMembers', { editUserId: m.id })}
                          activeOpacity={0.85}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={styles.rosterName}>{m.name || '(unnamed)'}</Text>
                            <Text style={styles.rosterMeta}>{m.email} · {labelForRole(m.role)}</Text>
                          </View>
                          <Text style={styles.rosterStat}>{m.events_attended || 0} ev · {m.lbs_rescued || Math.round((m.meals_rescued || 0) / 1.2)} lbs · {m.hours_logged || 0}h</Text>
                          <Text style={styles.rosterChev}>›</Text>
                        </TouchableOpacity>
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

                    {/* Stored status — useful while we figure out
                        why a chapter is or isn't on the public site. */}
                    <Text style={styles.statusDebug}>
                      Stored status: <Text style={styles.statusDebugVal}>{ch.status || '(none)'}</Text>
                    </Text>

                    {/* Actions */}
                    <View style={styles.actionRow}>
                      <Button title="Edit" variant="secondary" onPress={() => openEdit(ch)} style={{ flex: 1 }} />
                      <Button
                        title={ch.status === 'inactive' ? 'Reactivate' : 'Deactivate'}
                        onPress={() => toggleStatus(ch)}
                        style={{ flex: 1 }}
                      />
                    </View>
                    <TouchableOpacity onPress={() => handleDelete(ch)} style={styles.deleteRow}>
                      <Text style={styles.deleteText}>Delete chapter permanently</Text>
                    </TouchableOpacity>
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

              {/* Auto-formatted chapter name preview. We don't accept
                  a custom name — every chapter is "BetterNature {city}"
                  so the brand reads the same everywhere. */}
              <Text style={styles.fieldLabel}>Chapter will be named</Text>
              <View style={styles.previewBox}>
                <Text style={styles.previewText}>
                  {chapterNameFor(form.city) || 'BetterNature [city]'}
                </Text>
              </View>

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
  promoteBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#FFF7ED', borderColor: '#FDBA74', borderWidth: 1,
    borderRadius: Radius.xl, padding: 16, marginBottom: 16, flexWrap: 'wrap',
  },
  promoteTitle: { fontSize: 14, fontWeight: '800', color: '#9A3412' },
  promoteBody: { fontSize: 12, color: '#9A3412', marginTop: 4, lineHeight: 18 },

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
  teamEdit: { fontSize: 11, color: Colors.pink, fontWeight: '700', marginTop: 8 },

  rosterRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.grayLight },
  rosterName: { fontSize: 14, fontWeight: '700', color: Colors.dark },
  rosterMeta: { ...Type.caption, marginTop: 2 },
  rosterStat: { fontSize: 11, color: Colors.gray, fontWeight: '700' },
  rosterChev: { fontSize: 20, color: Colors.grayMid, marginLeft: 6 },

  fridgeRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.grayLight },
  fridgeName: { fontSize: 14, fontWeight: '700', color: Colors.dark },
  fridgeMeta: { ...Type.caption, marginTop: 2 },

  actionRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  statusDebug: { ...Type.caption, marginTop: 8, color: Colors.grayMid },
  statusDebugVal: { color: Colors.dark, fontWeight: '700' },
  deleteRow: { alignItems: 'center', paddingVertical: 12, marginTop: 6 },
  deleteText: { fontSize: 13, fontWeight: '700', color: '#DC2626' },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15,28,21,0.45)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalCard: { width: '100%', maxWidth: 540, backgroundColor: Colors.white, borderRadius: Radius.xl, padding: 22 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: Colors.green },
  modalHelp: { ...Type.caption, marginTop: 4, marginBottom: 14 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: Colors.gray, marginTop: 12, marginBottom: 4, letterSpacing: 0.4, textTransform: 'uppercase' },
  input: { borderWidth: 1, borderColor: Colors.glassBorder, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: Colors.dark, backgroundColor: '#FAF8F1' },
  previewBox: { backgroundColor: '#E8F5EE', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, borderWidth: 1, borderColor: Colors.green },
  previewText: { fontSize: 16, fontWeight: '800', color: Colors.green },
  modalRow2: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  modalActions: { flexDirection: 'row', marginTop: 18 },

  officerSlot: { marginTop: 10, padding: 12, backgroundColor: '#F7F5EF', borderRadius: 12 },
  officerSlotHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  officerSlotLabel: { fontSize: 13, fontWeight: '800', color: Colors.green, letterSpacing: 0.4, textTransform: 'uppercase', flex: 1 },
  officerCurrent: { fontSize: 13, fontWeight: '700', color: Colors.dark },
  officerCurrentEmpty: { fontSize: 13, fontStyle: 'italic', color: Colors.grayMid },
  officerClear: { fontSize: 11, fontWeight: '700', color: Colors.pink, paddingVertical: 4, paddingHorizontal: 8 },
  officerChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  officerChip: { backgroundColor: Colors.white, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor: Colors.glassBorder },
  officerChipActive: { backgroundColor: Colors.green, borderColor: Colors.green },
  officerChipText: { fontSize: 12, fontWeight: '700', color: Colors.dark },
  officerChipTextActive: { color: '#FFF' },
});

function OfficerEditor({ slots, team, members, onAssign, onClear }) {
  // De-dupe members by id (since team people are also in roster)
  const uniq = [];
  const seen = new Set();
  members.forEach((m) => {
    if (!m || seen.has(m.id)) return;
    seen.add(m.id); uniq.push(m);
  });
  return (
    <View>
      {slots.map((slot) => {
        const current = team.find((t) => t.role.key === slot.key)?.person;
        return (
          <View key={slot.key} style={styles.officerSlot}>
            <View style={styles.officerSlotHead}>
              <Text style={styles.officerSlotLabel}>{slot.label}</Text>
              {current ? (
                <>
                  <Text style={styles.officerCurrent}>{current.name || current.email}</Text>
                  <TouchableOpacity onPress={() => onClear(slot.key)}>
                    <Text style={styles.officerClear}>Clear</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <Text style={styles.officerCurrentEmpty}>unassigned</Text>
              )}
            </View>
            <View style={styles.officerChipRow}>
              {uniq.map((m) => {
                const isMe = current?.id === m.id;
                return (
                  <TouchableOpacity
                    key={m.id + slot.key}
                    style={[styles.officerChip, isMe && styles.officerChipActive]}
                    onPress={() => onAssign(m, slot.key)}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.officerChipText, isMe && styles.officerChipTextActive]}>
                      {m.name || m.email}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
}
