import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import { fetchAllMembers, updateUserRole } from '../../services/database';

const ROLES = ['volunteer', 'chapter_pres', 'chapter_vp', 'chapter_sec', 'chapter_treas'];

export default function ManageMembers({ navigation }) {
  const [members, setMembers] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      const data = await fetchAllMembers();
      setMembers(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  function handleRoleChange(member) {
    Alert.alert(
      `Change Role: ${member.name}`,
      `Current role: ${member.role}`,
      [
        ...ROLES.map((role) => ({
          text: role.replace('_', ' '),
          onPress: async () => {
            await updateUserRole(member.id, role);
            load();
          },
        })),
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  }

  const filtered = members.filter(
    (m) =>
      m.name?.toLowerCase().includes(search.toLowerCase()) ||
      m.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Text style={styles.back}>‹ Back</Text>
      </TouchableOpacity>
      <BrushText variant="screenTitle" style={styles.title}>
        Manage Members
      </BrushText>

      <TextInput
        style={styles.search}
        placeholder="Search by name or email..."
        placeholderTextColor={Colors.grayMid}
        value={search}
        onChangeText={setSearch}
      />

      <Text style={styles.count}>{filtered.length} members</Text>

      {filtered.map((m) => (
        <TouchableOpacity key={m.id} style={styles.card} onPress={() => handleRoleChange(m)}>
          <View style={styles.info}>
            <Text style={styles.name}>{m.name}</Text>
            <Text style={styles.email}>{m.email}</Text>
            <Text style={styles.chapter}>{m.chapters?.name || 'No chapter'}</Text>
          </View>
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>{m.role?.replace('_', ' ')}</Text>
          </View>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  content: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  back: { fontSize: 16, color: Colors.green, marginBottom: 8 },
  title: { color: Colors.green, marginBottom: 16 },
  search: {
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    padding: 14,
    fontSize: 15,
    borderWidth: 1.5,
    borderColor: Colors.grayLight,
    marginBottom: 12,
  },
  count: { ...Type.caption, marginBottom: 12 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: 14,
    marginBottom: 8,
    ...Shadows.card,
  },
  info: { flex: 1 },
  name: { fontSize: 15, fontWeight: '700', color: Colors.dark },
  email: { fontSize: 12, color: Colors.gray, marginTop: 1 },
  chapter: { fontSize: 12, color: Colors.sage, marginTop: 1 },
  roleBadge: {
    backgroundColor: Colors.greenLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  roleText: { fontSize: 11, fontWeight: '600', color: Colors.green, textTransform: 'capitalize' },
});
