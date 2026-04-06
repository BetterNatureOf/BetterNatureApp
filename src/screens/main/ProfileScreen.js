import React from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import StatCard from '../../components/ui/StatCard';
import BrushDivider from '../../components/ui/BrushDivider';
import useAuthStore from '../../store/authStore';
import { signOut } from '../../services/auth';

const MENU_ITEMS = [
  { key: 'settings', label: 'Settings', emoji: '⚙️', screen: 'Settings' },
  { key: 'about', label: 'About Better Nature', emoji: '🌿', screen: 'About' },
  { key: 'slack', label: 'Open Slack', emoji: '💬', action: 'slack' },
  { key: 'chapter', label: 'Chapter Info', emoji: '📍', screen: 'ChapterChecklist' },
];

export default function ProfileScreen({ navigation }) {
  const user = useAuthStore((s) => s.user);
  const { signOut: clearAuth } = useAuthStore();

  async function handleSignOut() {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          try {
            await signOut();
          } catch {}
          clearAuth();
        },
      },
    ]);
  }

  function handleMenuPress(item) {
    if (item.action === 'slack') {
      const { openSlack } = require('../../services/slack');
      openSlack();
    } else if (item.screen) {
      navigation.navigate(item.screen);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Avatar & Name */}
      <View style={styles.header}>
        {user?.avatar_url ? (
          <Image source={{ uri: user.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Text style={styles.avatarInitial}>
              {(user?.name || '?')[0].toUpperCase()}
            </Text>
          </View>
        )}
        <BrushText variant="screenTitle" style={styles.name}>
          {user?.name || 'Volunteer'}
        </BrushText>
        <Text style={styles.role}>
          {user?.role?.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase()) ||
            'Volunteer'}
        </Text>
        {user?.chapter?.name && (
          <Text style={styles.chapter}>{user.chapter.name} Chapter</Text>
        )}
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <StatCard
          number={user?.events_attended || 0}
          label="Events"
          color={Colors.green}
          style={styles.statItem}
        />
        <StatCard
          number={user?.meals_rescued || 0}
          label="Meals"
          color={Colors.sage}
          style={styles.statItem}
        />
        <StatCard
          number={`${user?.hours_logged || 0}h`}
          label="Hours"
          color={Colors.pink}
          style={styles.statItem}
        />
      </View>

      <BrushDivider />

      {/* Menu */}
      {MENU_ITEMS.map((item) => (
        <TouchableOpacity
          key={item.key}
          style={styles.menuItem}
          onPress={() => handleMenuPress(item)}
          activeOpacity={0.7}
        >
          <Text style={styles.menuEmoji}>{item.emoji}</Text>
          <Text style={styles.menuLabel}>{item.label}</Text>
          <Text style={styles.menuArrow}>›</Text>
        </TouchableOpacity>
      ))}

      <BrushDivider />

      <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  content: { paddingTop: 60, paddingBottom: 40 },
  header: { alignItems: 'center', paddingHorizontal: 24 },
  avatar: { width: 90, height: 90, borderRadius: 45, marginBottom: 12 },
  avatarPlaceholder: {
    backgroundColor: Colors.pinkLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { fontSize: 36, fontWeight: '700', color: Colors.pink },
  name: { color: Colors.green, textAlign: 'center' },
  role: { fontSize: 14, color: Colors.gray, marginTop: 2, textTransform: 'capitalize' },
  chapter: { ...Type.caption, marginTop: 2 },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    marginTop: 20,
    gap: 10,
  },
  statItem: { flex: 1 },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  menuEmoji: { fontSize: 22, marginRight: 14, width: 30 },
  menuLabel: { flex: 1, fontSize: 15, fontWeight: '500', color: Colors.dark },
  menuArrow: { fontSize: 22, color: Colors.grayMid },
  signOutBtn: { alignItems: 'center', paddingVertical: 16 },
  signOutText: { fontSize: 15, color: '#EF4444', fontWeight: '600' },
});
