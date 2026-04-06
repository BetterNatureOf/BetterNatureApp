import React, { useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import useNotifStore from '../../store/notifStore';
import { fetchNotifications, markNotificationRead } from '../../services/database';
import useAuthStore from '../../store/authStore';

const NOTIF_EMOJIS = {
  pickup: '🍽️',
  event: '📅',
  motm: '🌟',
  badge: '🏅',
  chapter: '📍',
  broadcast: '📢',
};

export default function NotificationsScreen({ navigation }) {
  const user = useAuthStore((s) => s.user);
  const { notifications, setNotifications, markRead, markAllRead } = useNotifStore();

  useEffect(() => {
    loadNotifs();
  }, []);

  async function loadNotifs() {
    if (!user?.id) return;
    try {
      const data = await fetchNotifications(user.id);
      setNotifications(data);
    } catch (e) {
      console.error(e);
    }
  }

  async function handlePress(notif) {
    if (!notif.read) {
      markRead(notif.id);
      markNotificationRead(notif.id);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={markAllRead}>
          <Text style={styles.markAll}>Mark all read</Text>
        </TouchableOpacity>
      </View>

      <BrushText variant="screenTitle" style={styles.title}>
        Notifications
      </BrushText>

      {notifications.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>🔔</Text>
          <Text style={styles.emptyText}>No notifications yet</Text>
        </View>
      ) : (
        notifications.map((notif) => (
          <TouchableOpacity
            key={notif.id}
            style={[styles.notifCard, !notif.read && styles.unread]}
            onPress={() => handlePress(notif)}
            activeOpacity={0.7}
          >
            <Text style={styles.notifEmoji}>
              {NOTIF_EMOJIS[notif.type] || '🔔'}
            </Text>
            <View style={styles.notifText}>
              <Text style={styles.notifTitle}>{notif.title}</Text>
              <Text style={styles.notifDesc} numberOfLines={2}>
                {notif.description}
              </Text>
              <Text style={styles.notifTime}>
                {new Date(notif.created_at).toLocaleDateString()}
              </Text>
            </View>
            {!notif.read && <View style={styles.unreadDot} />}
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  content: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  back: { fontSize: 16, color: Colors.green },
  markAll: { fontSize: 13, color: Colors.pink, fontWeight: '600' },
  title: { color: Colors.green, marginTop: 8, marginBottom: 20 },
  empty: { alignItems: 'center', padding: 40 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 15, color: Colors.gray },
  notifCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: 14,
    marginBottom: 8,
    ...Shadows.card,
  },
  unread: { backgroundColor: Colors.pinkLight },
  notifEmoji: { fontSize: 24, marginRight: 12 },
  notifText: { flex: 1 },
  notifTitle: { fontSize: 14, fontWeight: '700', color: Colors.dark },
  notifDesc: { ...Type.caption, marginTop: 2 },
  notifTime: { fontSize: 11, color: Colors.grayMid, marginTop: 4 },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.pink,
    marginLeft: 8,
  },
});
