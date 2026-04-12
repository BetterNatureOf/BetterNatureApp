import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import useAuthStore from '../../store/authStore';
import { fetchEvents } from '../../services/database';

const PROJECT_COLORS = {
  iris: Colors.sage,
  evergreen: Colors.green,
  hydro: Colors.sky,
};

export default function PresEvents({ navigation }) {
  const user = useAuthStore((s) => s.user);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchEvents(user?.chapter_id)
      .then(setEvents)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function fmtDate(d) {
    if (!d) return '';
    const dt = new Date(d);
    return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Text style={styles.back}>‹ Back</Text>
      </TouchableOpacity>
      <BrushText variant="screenTitle" style={styles.title}>
        Chapter Events
      </BrushText>
      <Text style={styles.subtitle}>Upcoming events for your chapter</Text>

      <TouchableOpacity
        style={styles.newBtn}
        activeOpacity={0.85}
        onPress={() =>
          Alert.alert('Create Event', 'Event creation form coming once Supabase is wired up.')
        }
      >
        <Text style={styles.newBtnText}>+ New Event</Text>
      </TouchableOpacity>

      {loading ? null : events.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>📅</Text>
          <Text style={styles.emptyText}>No upcoming events</Text>
        </View>
      ) : (
        events.map((ev) => (
          <View
            key={ev.id}
            style={[styles.card, { borderLeftColor: PROJECT_COLORS[ev.project] || Colors.sage }]}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.eventTitle}>{ev.title}</Text>
              <View style={styles.spotsBadge}>
                <Text style={styles.spotsText}>
                  {ev.filled_spots ?? 0}/{ev.spots ?? 0}
                </Text>
              </View>
            </View>
            <Text style={styles.eventMeta}>
              {fmtDate(ev.date)} · {ev.time}
            </Text>
            <Text style={styles.eventLocation}>📍 {ev.location}</Text>
            {ev.description ? (
              <Text style={styles.eventDesc} numberOfLines={2}>
                {ev.description}
              </Text>
            ) : null}
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.checkInBtn]}
                onPress={() => navigation.navigate('CheckIn', { event: ev })}
              >
                <Text style={[styles.actionText, styles.checkInText]}>Check In</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => Alert.alert('Edit Event', 'Edit form coming soon.')}
              >
                <Text style={styles.actionText}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.cancelBtn]}
                onPress={() =>
                  Alert.alert('Cancel Event', `Cancel "${ev.title}"?`, [
                    { text: 'No', style: 'cancel' },
                    { text: 'Yes', style: 'destructive' },
                  ])
                }
              >
                <Text style={[styles.actionText, styles.cancelText]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  content: { padding: 24, paddingTop: 60, paddingBottom: 60 },
  back: { fontSize: 16, color: Colors.green, marginBottom: 8 },
  title: { color: Colors.green },
  subtitle: { ...Type.body, color: Colors.gray, marginTop: 4, marginBottom: 16 },
  newBtn: {
    backgroundColor: Colors.green,
    borderRadius: Radius.lg,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 20,
    ...Shadows.button,
  },
  newBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  empty: { padding: 40, alignItems: 'center' },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyText: { ...Type.caption },
  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderLeftWidth: 4,
    padding: 16,
    marginBottom: 12,
    ...Shadows.card,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  eventTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: Colors.dark, marginRight: 10 },
  spotsBadge: {
    backgroundColor: Colors.greenLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  spotsText: { fontSize: 12, fontWeight: '700', color: Colors.green },
  eventMeta: { ...Type.caption, marginTop: 4, color: Colors.gray },
  eventLocation: { ...Type.caption, marginTop: 2, color: Colors.gray },
  eventDesc: { ...Type.caption, marginTop: 6, color: Colors.dark },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  actionBtn: {
    flex: 1,
    backgroundColor: Colors.greenLight,
    paddingVertical: 10,
    borderRadius: Radius.md,
    alignItems: 'center',
  },
  actionText: { fontSize: 13, fontWeight: '700', color: Colors.green },
  checkInBtn: { backgroundColor: Colors.green },
  checkInText: { color: Colors.white },
  cancelBtn: { backgroundColor: Colors.pinkLight },
  cancelText: { color: Colors.pink },
});
