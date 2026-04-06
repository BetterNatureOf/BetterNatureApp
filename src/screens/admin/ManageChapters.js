import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import { fetchChapters, updateChapter } from '../../services/database';

export default function ManageChapters({ navigation }) {
  const [chapters, setChapters] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      const data = await fetchChapters();
      setChapters(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function toggleStatus(chapter) {
    const newStatus = chapter.status === 'active' ? 'inactive' : 'active';
    Alert.alert(
      `${newStatus === 'active' ? 'Activate' : 'Deactivate'} Chapter`,
      `Set ${chapter.name} to ${newStatus}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            await updateChapter(chapter.id, { status: newStatus });
            load();
          },
        },
      ]
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Text style={styles.back}>‹ Back</Text>
      </TouchableOpacity>
      <BrushText variant="screenTitle" style={styles.title}>
        Manage Chapters
      </BrushText>

      {chapters.map((ch) => (
        <TouchableOpacity key={ch.id} style={styles.card} onPress={() => toggleStatus(ch)}>
          <View style={styles.info}>
            <Text style={styles.name}>{ch.name}</Text>
            <Text style={styles.location}>{ch.city}, {ch.state}</Text>
            <Text style={styles.members}>{ch.member_count || 0} members</Text>
          </View>
          <View style={[styles.statusBadge, ch.status === 'active' ? styles.active : styles.inactive]}>
            <Text style={[styles.statusText, ch.status === 'active' ? styles.activeText : styles.inactiveText]}>
              {ch.status}
            </Text>
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
  title: { color: Colors.green, marginBottom: 20 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: 16,
    marginBottom: 10,
    ...Shadows.card,
  },
  info: { flex: 1 },
  name: { fontSize: 16, fontWeight: '700', color: Colors.dark },
  location: { ...Type.caption, marginTop: 2 },
  members: { fontSize: 12, color: Colors.sage, marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  active: { backgroundColor: Colors.greenLight },
  inactive: { backgroundColor: Colors.pinkLight },
  statusText: { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  activeText: { color: Colors.green },
  inactiveText: { color: Colors.pink },
});
