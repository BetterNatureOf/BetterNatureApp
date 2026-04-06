import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';

const ADMIN_ITEMS = [
  { key: 'chapters', label: 'Manage Chapters', emoji: '📍', desc: 'View, edit, and approve chapters', screen: 'ManageChapters' },
  { key: 'members', label: 'Manage Members', emoji: '👥', desc: 'Search, filter, promote/demote members', screen: 'ManageMembers' },
  { key: 'restaurants', label: 'Manage Restaurants', emoji: '🍽️', desc: 'Approve/reject restaurant applications', screen: 'ManageRestaurants' },
  { key: 'history', label: 'Global History', emoji: '📊', desc: 'All activity across the organization', screen: 'GlobalHistory' },
  { key: 'broadcast', label: 'Broadcast', emoji: '📢', desc: 'Send announcements to chapters/restaurants', screen: 'Broadcast' },
  { key: 'reports', label: 'Export Reports', emoji: '📄', desc: 'Generate PDF/CSV reports', screen: 'ExportReports' },
];

export default function AdminPanel({ navigation }) {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <BrushText variant="screenTitle" style={styles.title}>
        Admin Panel
      </BrushText>
      <Text style={styles.subtitle}>Executive access only</Text>

      {ADMIN_ITEMS.map((item) => (
        <TouchableOpacity
          key={item.key}
          style={styles.card}
          onPress={() => navigation.navigate(item.screen)}
          activeOpacity={0.7}
        >
          <Text style={styles.emoji}>{item.emoji}</Text>
          <View style={styles.textWrap}>
            <Text style={styles.label}>{item.label}</Text>
            <Text style={styles.desc}>{item.desc}</Text>
          </View>
          <Text style={styles.arrow}>›</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  content: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  title: { color: Colors.green },
  subtitle: { ...Type.body, color: Colors.gray, marginTop: 4, marginBottom: 24 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: 18,
    marginBottom: 12,
    ...Shadows.card,
  },
  emoji: { fontSize: 28, marginRight: 16 },
  textWrap: { flex: 1 },
  label: { fontSize: 16, fontWeight: '700', color: Colors.dark },
  desc: { ...Type.caption, marginTop: 2 },
  arrow: { fontSize: 24, color: Colors.grayMid },
});
