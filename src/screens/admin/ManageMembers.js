import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
} from 'react-native';
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

const ROLE_OPTIONS = [
  { key: 'member', label: 'Member', desc: 'Regular volunteer' },
  { key: 'chapter_president', label: 'Chapter President', desc: 'Leads a chapter, can check in and edit metrics' },
  { key: 'executive', label: 'Executive', desc: 'Full org control — all chapters, all tools' },
  { key: 'restaurant', label: 'Restaurant Partner', desc: 'Restaurant portal access' },
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

export default function ManageMembers({ navigation }) {
  const { isWide } = useBreakpoint();
  const [members, setMembers] = useState([]);
  const [chapters, setChapters] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // member being edited
  const [selectedRole, setSelectedRole] = useState('');
  const [selectedChapter, setSelectedChapter] = useState('');

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

  function openEdit(member) {
    setEditing(member);
    setSelectedRole(member.role || 'member');
    setSelectedChapter(member.chapter_id || member.chapters?.id || '');
  }

  async function saveEdit() {
    if (!editing) return;
    try {
      if (selectedRole !== editing.role) {
        await updateUserRole(editing.id, selectedRole);
      }
      const currentChapter = editing.chapter_id || '';
      if (selectedChapter !== currentChapter) {
        await updateUserChapter(editing.id, selectedChapter || null);
      }
      setEditing(null);
      load();
    } catch (e) {
      Alert.alert('Error', e?.message || 'Failed to update member');
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

  // Group by role for quick scanning
  const execs = filtered.filter(
    (m) => m.role === 'executive'
  );
  const presidents = filtered.filter(
    (m) => m.role === 'chapter_president' || m.role === 'chapter_pres'
  );
  const rest = filtered.filter(
    (m) =>
      m.role !== 'executive' &&
      m.role !== 'chapter_president' &&
      m.role !== 'chapter_pres'
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
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

        <TextInput
          style={styles.search}
          placeholder="Search by name, email, or chapter..."
          placeholderTextColor={Colors.grayMid}
          value={search}
          onChangeText={setSearch}
        />

        <Text style={styles.count}>{filtered.length} members</Text>

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
            <Text style={styles.groupLabel}>Members & Volunteers</Text>
            <MemberList
              members={rest}
              onEdit={openEdit}
              onRemove={handleRemove}
              wide={isWide}
            />
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
              <Text style={styles.modalTitle}>{editing?.name}</Text>
              <Text style={styles.modalEmail}>{editing?.email}</Text>

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
            </View>
          </View>
        </Modal>
      </ResponsiveContainer>
    </ScrollView>
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
  container: { flex: 1, backgroundColor: Colors.cream },
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
  groupLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: Colors.gray,
    marginTop: 16,
    marginBottom: 8,
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
