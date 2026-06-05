import React, { useState, useEffect, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, Alert, Modal, Platform, Image } from 'react-native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import Button from '../../components/ui/Button';
import ResponsiveContainer from '../../components/ui/ResponsiveContainer';
import useBreakpoint from '../../hooks/useBreakpoint';
import {
  fetchAllMembers,
  fetchChapters,
  updateUserRole,
  updateUserChapter,
  removeUser,
} from '../../services/database';
import { updateProfile } from '../../services/auth';
import Screen from '../../components/ui/Screen';
import { notify } from '../../services/ui';
import { selfPromoteToExecutive, isFounderEmail } from '../../services/founder';
import { getProfile } from '../../services/auth';
import useAuthStore from '../../store/authStore';

// Display order: highest org-wide privilege at the top, then chapter
// officers in their seniority sequence, then plain Member, then the
// restaurant-portal role on its own at the bottom.
const ROLE_OPTIONS = [
  { key: 'executive',          label: 'Executive',             desc: 'Full org control — all chapters, all tools' },
  { key: 'chapter_president',  label: 'Chapter President',     desc: 'Leads a chapter, can check in and edit metrics' },
  { key: 'chapter_vp',         label: 'Vice President',        desc: 'Backs up the president for one chapter' },
  { key: 'chapter_treas',      label: 'Treasurer',             desc: 'Tracks chapter finance + receipts' },
  { key: 'chapter_vol_coord',  label: 'Volunteer Coordinator', desc: 'Schedules events + recruits members' },
  { key: 'chapter_sec',        label: 'Secretary',             desc: 'Meeting notes + chapter communication' },
  { key: 'member',             label: 'Member',                desc: 'Regular volunteer' },
  { key: 'restaurant',         label: 'Restaurant Partner',    desc: 'Restaurant portal access' },
];

const ROLE_COLORS = {
  executive: Colors.pink,
  chapter_president: Colors.green,
  member: Colors.sage,
  restaurant: Colors.skyDark,
  volunteer: Colors.sage,
  chapter_pres: Colors.green,
  chapter_vp: Colors.green,
  chapter_sec: Colors.sage,
  chapter_treas: Colors.sage,
};

function roleBadgeLabel(role) {
  if (role === 'chapter_president' || role === 'chapter_pres') return 'President';
  if (role === 'executive') return 'Executive';
  if (role === 'restaurant') return 'Restaurant';
  if (role === 'chapter_vp') return 'Vice Pres';
  if (role === 'chapter_sec') return 'Secretary';
  if (role === 'chapter_treas') return 'Treasurer';
  return 'Member';
}

export default function ManageMembers({ navigation, route }) {
  const authUser = useAuthStore((s) => s.user);
  const setAuthUser = useAuthStore((s) => s.setUser);
  const { isWide } = useBreakpoint();
  const [needsPromote, setNeedsPromote] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [members, setMembers] = useState([]);
  const [chapters, setChapters] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // member being edited
  const [selectedRole, setSelectedRole] = useState('');
  const [selectedChapter, setSelectedChapter] = useState('');
  // Editable stats so a chapter president can correct a miscount
  // after an event (e.g. someone forgot to scan in).
  const [statEvents, setStatEvents] = useState('0');
  const [statMeals, setStatMeals]   = useState('0');
  const [statHours, setStatHours]   = useState('0');

  const load = useCallback(async () => {
    try {
      const [m, c] = await Promise.all([fetchAllMembers(), fetchChapters()]);
      setMembers(m);
      setChapters(c);
    } catch (e) {}
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Re-pull members every time the screen is focused so a new
  // signup created in another tab shows up without needing a
  // manual reload.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // If we arrived here from Manage Chapters with an editUserId, pop
  // the edit modal for that member as soon as the roster loads.
  useEffect(() => {
    const want = route?.params?.editUserId;
    if (!want || !members.length) return;
    const target = members.find((m) => m.id === want);
    if (target) openEdit(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route?.params?.editUserId, members]);

  // Founder-only banner (same gating as ManageChapters).
  useEffect(() => {
    const role = (authUser?.role || 'member').toLowerCase();
    const ok = new Set(['executive', 'admin', 'super_admin']);
    setNeedsPromote(isFounderEmail(authUser?.email) && !ok.has(role));
  }, [authUser?.role, authUser?.email]);

  async function handlePromoteNow() {
    if (!authUser?.id) return;
    setPromoting(true);
    try {
      await selfPromoteToExecutive(authUser.id);
      const fresh = await getProfile(authUser.id);
      if (fresh && setAuthUser) setAuthUser(fresh);
      setNeedsPromote(false);
      notify('Done', "You're now an Executive. Try the edit again.");
    } catch (e) {
      notify('Could not upgrade', e?.message || 'Sign out, sign back in, and try again.');
    } finally { setPromoting(false); }
  }

  function openEdit(member) {
    setEditing(member);
    setSelectedRole(member.role || 'member');
    setSelectedChapter(member.chapter_id || member.chapters?.id || '');
    setStatEvents(String(member.events_attended || 0));
    setStatMeals(String(member.meals_rescued || 0));
    setStatHours(String(member.hours_logged || 0));
  }

  async function saveEdit() {
    if (!editing) return;
    // Snapshot what's being edited so we can close the modal first
    // and run the writes after. Closing first means a successful
    // save never leaves the modal stuck open — the previous bug
    // was that one of the writes was throwing silently before
    // setEditing(null) could run.
    const target       = editing;
    const nextRole     = selectedRole;
    const nextChapter  = selectedChapter;
    const ne           = parseInt(statEvents, 10);
    const nm           = parseInt(statMeals, 10);
    const nh           = parseFloat(statHours);

    setEditing(null);
    try {
      if (nextRole !== target.role) {
        await updateUserRole(target.id, nextRole);
      }
      const currentChapter = target.chapter_id || '';
      if (nextChapter !== currentChapter) {
        await updateUserChapter(target.id, nextChapter || null);
      }
      // Stats — only push the ones that actually changed so we don't
      // overwrite an in-flight server increment from an event check-in.
      const updates = {};
      if (!Number.isNaN(ne) && ne !== (target.events_attended || 0)) updates.events_attended = ne;
      if (!Number.isNaN(nm) && nm !== (target.meals_rescued    || 0)) updates.meals_rescued  = nm;
      if (!Number.isNaN(nh) && nh !== (target.hours_logged     || 0)) updates.hours_logged   = nh;
      if (Object.keys(updates).length) {
        await updateProfile(target.id, updates);
      }
      load();
    } catch (e) {
      const code = (e?.code || '').toLowerCase();
      const msg = e?.message || 'Failed to update member';
      const isPerm = code.includes('permission-denied') || msg.toLowerCase().includes('missing or insufficient');
      if (isPerm) {
        const role = (authUser?.role || 'member').toLowerCase();
        const ok = new Set(['executive', 'admin', 'super_admin']);
        if (isFounderEmail(authUser?.email) && !ok.has(role)) {
          notify(
            'You\'re not Executive yet',
            'Editing other members requires Executive role. Scroll up and tap "Make me Executive", then retry.'
          );
        } else {
          notify('Permission denied', 'Only Executives can edit other members\' roles or stats.');
        }
      } else {
        notify('Could not save', msg);
      }
    }
  }

  function handleRemove(member) {
    Alert.alert(
      'Remove Member',
      `Remove ${member.name} from the organization? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeUser(member.id);
              load();
            } catch (e) {
              Alert.alert('Error', e?.message || 'Failed to remove');
            }
          },
        },
      ]
    );
  }

  const filtered = members.filter(
    (m) =>
      m.name?.toLowerCase().includes(search.toLowerCase()) ||
      m.email?.toLowerCase().includes(search.toLowerCase()) ||
      (m.chapters?.name || '').toLowerCase().includes(search.toLowerCase())
  );

  async function setMemberStatus(member, status) {
    try {
      await updateProfile(member.id, { member_status: status });
      load();
    } catch (e) {
      Alert.alert('Error', e?.message || 'Failed to update status');
    }
  }

  // Restaurants have their own portal + Manage Restaurants screen,
  // so they shouldn't pollute the members view here.
  const visible = filtered.filter((m) => (m.role || 'member') !== 'restaurant');

  // Pending applications get their own section at the top so the
  // exec sees them on every visit without scrolling.
  const pending = visible.filter((m) => m.member_status === 'pending');
  // Group by role for quick scanning
  const execs = visible.filter(
    (m) => m.role === 'executive' && m.member_status !== 'pending'
  );
  const presidents = visible.filter(
    (m) => (m.role === 'chapter_president' || m.role === 'chapter_pres') && m.member_status !== 'pending'
  );
  const rest = visible.filter(
    (m) =>
      m.role !== 'executive' &&
      m.role !== 'chapter_president' &&
      m.role !== 'chapter_pres' &&
      m.member_status !== 'pending'
  );

  return (
    <Screen contentStyle={styles.content}>
      <ResponsiveContainer maxWidth={900}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
        <BrushText variant="screenTitle" style={styles.title}>
          Manage Members
        </BrushText>
        <Text style={styles.subtitle}>
          Tap a member to change their role or chapter assignment.
        </Text>

        {needsPromote ? (
          <View style={styles.promoteBanner}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={styles.promoteTitle}>Heads up — you're not Executive yet</Text>
              <Text style={styles.promoteBody}>
                Editing other members' roles requires Executive permission. Tap to upgrade your own account; you can do this because Firestore lets you edit your own profile.
              </Text>
            </View>
            <Button title="Make me Executive" onPress={handlePromoteNow} loading={promoting} style={{ minWidth: 170 }} />
          </View>
        ) : null}

        <TextInput
          style={styles.search}
          placeholder="Search by name, email, or chapter..."
          placeholderTextColor={Colors.grayMid}
          value={search}
          onChangeText={setSearch}
        />

        <Text style={styles.count}>{visible.length} members</Text>

        {pending.length > 0 && (
          <>
            <Text style={[styles.groupLabel, { color: Colors.pink }]}>
              Pending approval ({pending.length})
            </Text>
            {pending.map((m) => (
              <View key={m.id} style={styles.pendingRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pendingName}>{m.name || '(no name)'}</Text>
                  <Text style={styles.pendingEmail}>{m.email}</Text>
                  {m.chapters?.name ? <Text style={styles.pendingEmail}>{m.chapters.name}</Text> : null}
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button title="Approve" variant="small" onPress={() => setMemberStatus(m, 'approved')} />
                  <Button title="Reject" variant="small" onPress={() => setMemberStatus(m, 'rejected')} />
                </View>
              </View>
            ))}
          </>
        )}

        {execs.length > 0 && (
          <>
            <Text style={styles.groupLabel}>Executives</Text>
            <MemberList
              members={execs}
              onEdit={openEdit}
              onRemove={handleRemove}
              wide={isWide}
            />
          </>
        )}

        {presidents.length > 0 && (
          <>
            <Text style={styles.groupLabel}>Chapter Presidents</Text>
            <MemberList
              members={presidents}
              onEdit={openEdit}
              onRemove={handleRemove}
              wide={isWide}
            />
          </>
        )}

        {rest.length > 0 && (
          <>
            <Text style={styles.groupLabel}>Members & Volunteers (by chapter)</Text>
            {/* Group members by chapter so the exec sees who's where. */}
            {(() => {
              const groups = new Map();
              rest.forEach((m) => {
                const key = m.chapter_id || '__none__';
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key).push(m);
              });
              const ordered = [...groups.entries()].sort(([a], [b]) => {
                if (a === '__none__') return 1;
                if (b === '__none__') return -1;
                const an = chapters.find((c) => c.id === a)?.name || '';
                const bn = chapters.find((c) => c.id === b)?.name || '';
                return an.localeCompare(bn);
              });
              return ordered.map(([key, list]) => {
                const chapterName =
                  key === '__none__'
                    ? 'No chapter assigned'
                    : chapters.find((c) => c.id === key)?.name || 'Unknown chapter';
                return (
                  <View key={key} style={{ marginTop: 12 }}>
                    <Text style={styles.chapterHeader}>
                      {chapterName} <Text style={styles.chapterCount}>· {list.length}</Text>
                    </Text>
                    <MemberList
                      members={list}
                      onEdit={openEdit}
                      onRemove={handleRemove}
                      wide={isWide}
                    />
                  </View>
                );
              });
            })()}
          </>
        )}

        {/* Edit modal */}
        <Modal
          visible={!!editing}
          transparent
          animationType="fade"
          onRequestClose={() => setEditing(null)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <ScrollView style={{ maxHeight: '90vh' }} contentContainerStyle={{ paddingBottom: 8 }}>
              <Text style={styles.modalTitle}>{editing?.name || '(no name)'}</Text>
              <Text style={styles.modalEmail}>{editing?.email}</Text>

              {/* Contact info */}
              <View style={styles.detailGrid}>
                {editing?.phone ? (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailKey}>Phone</Text>
                    <Text style={styles.detailVal} selectable>{editing.phone}</Text>
                  </View>
                ) : null}
                {(editing?.address || editing?.city || editing?.zip) ? (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailKey}>Address</Text>
                    <Text style={styles.detailVal} selectable>
                      {[editing?.address, editing?.city, editing?.zip].filter(Boolean).join(', ')}
                    </Text>
                  </View>
                ) : null}
                <View style={styles.detailRow}>
                  <Text style={styles.detailKey}>User ID</Text>
                  <Text style={styles.detailValMono} selectable>{editing?.id}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailKey}>Status</Text>
                  <Text style={styles.detailVal}>
                    {editing?.member_status || 'approved'}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailKey}>ID verification</Text>
                  <Text style={styles.detailVal}>
                    {editing?.verification_status || 'not submitted'}
                  </Text>
                </View>
              </View>

              {/* Stats */}
              <View style={styles.statsGrid}>
                <View style={styles.statBox}>
                  <Text style={styles.statBig}>{editing?.events_attended || 0}</Text>
                  <Text style={styles.statLabel}>Events</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statBig}>{editing?.lbs_rescued || Math.round((editing?.meals_rescued || 0) / 1.2)}</Text>
                  <Text style={styles.statLabel}>Lbs</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statBig}>{editing?.hours_logged || 0}h</Text>
                  <Text style={styles.statLabel}>Hours</Text>
                </View>
              </View>

              {/* ID images */}
              {(editing?.id_document_front_url || editing?.id_document_url || editing?.id_document_back_url) ? (
                <>
                  <Text style={[styles.fieldLabel, { marginTop: 8 }]}>ID document</Text>
                  <View style={styles.idImagesRow}>
                    {(editing?.id_document_front_url || editing?.id_document_url) ? (
                      <Image
                        source={{ uri: editing.id_document_front_url || editing.id_document_url }}
                        style={styles.idImage}
                        resizeMode="cover"
                      />
                    ) : null}
                    {editing?.id_document_back_url ? (
                      <Image
                        source={{ uri: editing.id_document_back_url }}
                        style={styles.idImage}
                        resizeMode="cover"
                      />
                    ) : null}
                  </View>
                </>
              ) : null}

              <Text style={styles.fieldLabel}>Role</Text>
              {ROLE_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.key}
                  style={[
                    styles.roleOption,
                    selectedRole === opt.key && styles.roleOptionActive,
                  ]}
                  activeOpacity={0.85}
                  onPress={() => setSelectedRole(opt.key)}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.roleOptionLabel,
                        selectedRole === opt.key && styles.roleOptionLabelActive,
                      ]}
                    >
                      {opt.label}
                    </Text>
                    <Text style={styles.roleOptionDesc}>{opt.desc}</Text>
                  </View>
                  {selectedRole === opt.key && (
                    <Text style={styles.checkMark}>✓</Text>
                  )}
                </TouchableOpacity>
              ))}

              <Text style={[styles.fieldLabel, { marginTop: 16 }]}>
                Chapter
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chapterChips}
              >
                <TouchableOpacity
                  style={[
                    styles.chapterChip,
                    !selectedChapter && styles.chapterChipActive,
                  ]}
                  onPress={() => setSelectedChapter('')}
                >
                  <Text
                    style={[
                      styles.chapterChipText,
                      !selectedChapter && styles.chapterChipTextActive,
                    ]}
                  >
                    None
                  </Text>
                </TouchableOpacity>
                {chapters.map((ch) => (
                  <TouchableOpacity
                    key={ch.id}
                    style={[
                      styles.chapterChip,
                      selectedChapter === ch.id && styles.chapterChipActive,
                    ]}
                    onPress={() => setSelectedChapter(ch.id)}
                  >
                    <Text
                      style={[
                        styles.chapterChipText,
                        selectedChapter === ch.id &&
                          styles.chapterChipTextActive,
                      ]}
                    >
                      {ch.name.replace(' Chapter', '')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={[styles.fieldLabel, { marginTop: 16 }]}>
                Stats (editable by chapter president + execs)
              </Text>
              <View style={styles.statEditRow}>
                <View style={styles.statEditCell}>
                  <Text style={styles.statEditLabel}>Events</Text>
                  <TextInput
                    style={styles.statEditInput}
                    value={statEvents}
                    onChangeText={setStatEvents}
                    keyboardType="number-pad"
                    placeholder="0"
                  />
                </View>
                <View style={styles.statEditCell}>
                  <Text style={styles.statEditLabel}>Lbs</Text>
                  <TextInput
                    style={styles.statEditInput}
                    value={statMeals}
                    onChangeText={setStatMeals}
                    keyboardType="number-pad"
                    placeholder="0"
                  />
                </View>
                <View style={styles.statEditCell}>
                  <Text style={styles.statEditLabel}>Hours</Text>
                  <TextInput
                    style={styles.statEditInput}
                    value={statHours}
                    onChangeText={setStatHours}
                    keyboardType="decimal-pad"
                    placeholder="0"
                  />
                </View>
              </View>

              <View style={styles.modalRow}>
                <Button
                  title="Cancel"
                  variant="secondary"
                  onPress={() => setEditing(null)}
                  style={{ flex: 1, marginRight: 8 }}
                />
                <Button
                  title="Save"
                  onPress={saveEdit}
                  style={{ flex: 1, marginLeft: 8 }}
                />
              </View>
              </ScrollView>
            </View>
          </View>
        </Modal>
      </ResponsiveContainer>
    </Screen>
  );
}

function MemberList({ members, onEdit, onRemove, wide }) {
  return (
    <View style={[styles.list, wide && styles.listWide]}>
      {members.map((m) => (
        <TouchableOpacity
          key={m.id}
          style={[styles.card, wide && styles.cardWide]}
          activeOpacity={0.85}
          onPress={() => onEdit(m)}
          onLongPress={() => onRemove(m)}
        >
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{m.name?.[0] || '?'}</Text>
          </View>
          <View style={styles.info}>
            <Text style={styles.name} numberOfLines={1}>
              {m.name}
            </Text>
            <Text style={styles.email} numberOfLines={1}>
              {m.email}
            </Text>
            <Text style={styles.chapter}>
              {m.chapters?.name || 'No chapter'}
            </Text>
          </View>
          <View
            style={[
              styles.roleBadge,
              { backgroundColor: (ROLE_COLORS[m.role] || Colors.sage) + '22' },
            ]}
          >
            <Text
              style={[
                styles.roleText,
                { color: ROLE_COLORS[m.role] || Colors.sage },
              ]}
            >
              {roleBadgeLabel(m.role)}
            </Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
    ...(Platform.OS === 'web' ? { height: '100vh' } : null),
  },
  content: { padding: 24, paddingTop: 60, paddingBottom: 60 },
  back: { fontSize: 16, color: Colors.green, marginBottom: 8 },
  title: { color: Colors.green },
  subtitle: {
    ...Type.caption,
    color: Colors.gray,
    marginTop: 4,
    marginBottom: 16,
  },
  search: {
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    padding: 14,
    fontSize: 15,
    borderWidth: 1.5,
    borderColor: Colors.grayLight,
    marginBottom: 12,
    color: Colors.dark,
  },
  count: { ...Type.caption, marginBottom: 8 },
  promoteBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#FFF7ED', borderColor: '#FDBA74', borderWidth: 1,
    borderRadius: Radius.xl, padding: 16, marginVertical: 14, flexWrap: 'wrap',
  },
  promoteTitle: { fontSize: 14, fontWeight: '800', color: '#9A3412' },
  promoteBody: { fontSize: 12, color: '#9A3412', marginTop: 4, lineHeight: 18 },
  groupLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: Colors.gray,
    marginTop: 16,
    marginBottom: 8,
  },
  pendingRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#FFF1F2', borderRadius: 12, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: '#FECDD3',
  },
  pendingName: { fontSize: 15, fontWeight: '700', color: Colors.dark },
  pendingEmail: { fontSize: 12, color: Colors.gray, marginTop: 2 },
  chapterHeader: {
    fontSize: 13, fontWeight: '700', color: Colors.green,
    marginTop: 6, marginBottom: 6, letterSpacing: 0.2,
  },
  chapterCount: { color: Colors.grayMid, fontWeight: '500' },
  detailGrid: {
    backgroundColor: Colors.grayFaint || '#F7F5EF', borderRadius: 12,
    padding: 12, marginTop: 10, marginBottom: 12, gap: 6,
  },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  detailKey: { fontSize: 12, color: Colors.grayMid, fontWeight: '600', flexShrink: 0 },
  detailVal: { fontSize: 13, color: Colors.dark, fontWeight: '500', textAlign: 'right', flexShrink: 1 },
  detailValMono: { fontSize: 11, color: Colors.dark, textAlign: 'right', flexShrink: 1, fontFamily: Platform.OS === 'web' ? 'monospace' : 'Courier' },
  statsGrid: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  statBox: { flex: 1, alignItems: 'center', backgroundColor: Colors.white, borderRadius: 10, paddingVertical: 12, borderWidth: 1, borderColor: Colors.glassBorder },
  statBig: { fontSize: 22, fontWeight: '800', color: Colors.green },
  statLabel: { fontSize: 11, color: Colors.grayMid, marginTop: 2, fontWeight: '600' },
  idImagesRow: { flexDirection: 'row', gap: 8, marginTop: 4, marginBottom: 12 },
  idImage: { flex: 1, height: 110, borderRadius: 10, backgroundColor: Colors.grayLight },
  statEditRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  statEditCell: { flex: 1 },
  statEditLabel: { fontSize: 11, color: Colors.grayMid, fontWeight: '700', marginBottom: 4, letterSpacing: 0.4, textTransform: 'uppercase' },
  statEditInput: {
    borderWidth: 1, borderColor: Colors.glassBorder, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, fontWeight: '700',
    color: Colors.green, backgroundColor: '#FAF8F1', textAlign: 'center',
  },
  list: { gap: 8, marginBottom: 8 },
  listWide: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: 14,
    ...Shadows.card,
  },
  cardWide: { flexBasis: '48%', flexGrow: 1 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.sage,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: { color: Colors.white, fontWeight: '800', fontSize: 16 },
  info: { flex: 1 },
  name: { fontSize: 15, fontWeight: '700', color: Colors.dark },
  email: { fontSize: 12, color: Colors.gray, marginTop: 1 },
  chapter: { fontSize: 12, color: Colors.sage, marginTop: 1 },
  roleBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  roleText: {
    fontSize: 11,
    fontWeight: '700',
  },

  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: 24,
    maxHeight: '85%',
    ...Shadows.card,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: Colors.green },
  modalEmail: { ...Type.caption, color: Colors.gray, marginBottom: 16 },
  fieldLabel: {
    fontSize: 12,
    color: Colors.gray,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  roleOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.grayLight,
    marginBottom: 8,
  },
  roleOptionActive: {
    borderColor: Colors.green,
    backgroundColor: Colors.greenLight,
  },
  roleOptionLabel: { fontSize: 14, fontWeight: '700', color: Colors.dark },
  roleOptionLabelActive: { color: Colors.green },
  roleOptionDesc: { fontSize: 11, color: Colors.gray, marginTop: 2 },
  checkMark: { fontSize: 18, color: Colors.green, fontWeight: '800' },
  chapterChips: { gap: 8, paddingBottom: 4 },
  chapterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: Colors.grayLight,
    backgroundColor: Colors.white,
  },
  chapterChipActive: {
    borderColor: Colors.green,
    backgroundColor: Colors.green,
  },
  chapterChipText: { fontSize: 13, fontWeight: '600', color: Colors.dark },
  chapterChipTextActive: { color: Colors.white },
  modalRow: { flexDirection: 'row', marginTop: 20 },
});
