import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import Icon from '../../components/ui/Icon';

const ADMIN_ITEMS = [
  { key: 'chapters', label: 'Manage Chapters', icon: 'pin', desc: 'View, edit, and approve chapters', screen: 'ManageChapters' },
  { key: 'members', label: 'Manage Members', icon: 'users', desc: 'Search, filter, promote/demote members', screen: 'ManageMembers' },
  { key: 'restaurants', label: 'Manage Restaurants', icon: 'store', desc: 'Approve/reject restaurant applications', screen: 'ManageRestaurants' },
  { key: 'fridges', label: 'Manage Fridges', icon: 'pin', desc: 'Add or edit community fridge drop-off locations', screen: 'ManageFridges' },
  { key: 'verifications', label: 'Verify IDs', icon: 'id-card', desc: 'Review IDs + signed waivers · approve volunteers to claim pickups', screen: 'ManageVerifications' },
  { key: 'history', label: 'Global History', icon: 'trending', desc: 'All activity across the organization', screen: 'GlobalHistory' },
  { key: 'broadcast', label: 'Broadcast', icon: 'bell', desc: 'Send announcements to chapters/restaurants', screen: 'Broadcast' },
  { key: 'reports', label: 'Export Reports', icon: 'file', desc: 'Generate PDF/CSV reports', screen: 'ExportReports' },
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
          <View style={styles.iconWrap}>
            <Icon name={item.icon} size={22} color={Colors.green} strokeWidth={2.25} />
          </View>
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
  iconWrap: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: Colors.greenLight,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 14,
  },
  textWrap: { flex: 1 },
  label: { fontSize: 16, fontWeight: '700', color: Colors.dark },
  desc: { ...Type.caption, marginTop: 2 },
  arrow: { fontSize: 24, color: Colors.grayMid },
});
