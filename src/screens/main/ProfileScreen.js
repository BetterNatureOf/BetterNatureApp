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
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import StatCard from '../../components/ui/StatCard';
import BrushDivider from '../../components/ui/BrushDivider';
import useAuthStore from '../../store/authStore';
import { signOut } from '../../services/auth';

const MENU_ITEMS = [
  { key: 'refer', label: 'Bring a friend', emoji: '\u{1F381}', screen: 'Refer' },
  { key: 'settings', label: 'Settings', emoji: '\u2699\uFE0F', screen: 'Settings' },
  { key: 'about', label: 'About BetterNature', emoji: '\u{1F33F}', screen: 'About' },
  { key: 'slack', label: 'Open Slack', emoji: '\u{1F4AC}', action: 'slack' },
  { key: 'chapter', label: 'Chapter Info', emoji: '\u{1F4CD}', screen: 'ChapterChecklist' },
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
      {/* Profile Header */}
      <LinearGradient
        colors={Colors.gradient.green}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerGradient}
      >
        <View style={styles.avatarRing}>
          {user?.avatar_url ? (
            <Image source={{ uri: user.avatar_url }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Text style={styles.avatarInitial}>
                {(user?.name || '?')[0].toUpperCase()}
              </Text>
            </View>
          )}
        </View>
        <BrushText variant="screenTitle" style={styles.name}>
          {user?.name || 'Volunteer'}
        </BrushText>
        <View style={styles.rolePill}>
          <Text style={styles.roleText}>
            {user?.role?.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase()) ||
              'Volunteer'}
          </Text>
        </View>
        {user?.chapter?.name && (
          <Text style={styles.chapter}>{user.chapter.name} Chapter</Text>
        )}
      </LinearGradient>

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
      <View style={styles.menuCard}>
        {MENU_ITEMS.map((item, i) => (
          <React.Fragment key={item.key}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => handleMenuPress(item)}
              activeOpacity={0.7}
            >
              <View style={styles.menuIconWrap}>
                <Text style={styles.menuEmoji}>{item.emoji}</Text>
              </View>
              <Text style={styles.menuLabel}>{item.label}</Text>
              <Text style={styles.menuArrow}>{'\u203A'}</Text>
            </TouchableOpacity>
            {i < MENU_ITEMS.length - 1 && <View style={styles.menuDivider} />}
          </React.Fragment>
        ))}
      </View>

      <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  content: { paddingBottom: 40 },
  headerGradient: {
    paddingTop: 70,
    paddingBottom: 32,
    alignItems: 'center',
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  avatarRing: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  avatar: { width: 88, height: 88, borderRadius: 44, borderWidth: 3, borderColor: Colors.white },
  avatarPlaceholder: {
    backgroundColor: Colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { fontSize: 36, fontWeight: '700', color: Colors.green },
  name: { color: Colors.white, textAlign: 'center' },
  rolePill: {
    marginTop: 6,
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 12,
  },
  roleText: { fontSize: 13, color: 'rgba(255,255,255,0.9)', fontWeight: '600', textTransform: 'capitalize' },
  chapter: { color: 'rgba(255,255,255,0.65)', fontSize: 13, marginTop: 6, fontWeight: '500' },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    marginTop: 22,
    gap: 10,
  },
  statItem: { flex: 1 },
  menuCard: {
    marginHorizontal: 24,
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    overflow: 'hidden',
    ...Shadows.soft,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  menuIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: Colors.grayFaint,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  menuEmoji: { fontSize: 18 },
  menuLabel: { flex: 1, fontSize: 15, fontWeight: '500', color: Colors.dark },
  menuArrow: { fontSize: 22, color: Colors.grayMid },
  menuDivider: {
    height: 1,
    backgroundColor: Colors.grayLight,
    marginHorizontal: 18,
    opacity: 0.5,
  },
  signOutBtn: {
    alignItems: 'center',
    paddingVertical: 20,
    marginTop: 8,
  },
  signOutText: { fontSize: 15, color: '#EF4444', fontWeight: '600' },
});
