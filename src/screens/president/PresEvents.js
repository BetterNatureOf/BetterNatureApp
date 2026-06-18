// Chapter-events screen for chapter presidents (and execs viewing
// their own chapter). Lists upcoming events, lets the pres compose
// a new event with an optional 'repeat weekly' template so a
// recurring Tuesday pickup doesn't have to be re-created every week.
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, TextInput, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import Button from '../../components/ui/Button';
import ResponsiveContainer from '../../components/ui/ResponsiveContainer';
import Screen from '../../components/ui/Screen';
import useAuthStore from '../../store/authStore';
import { fetchEvents, createEvent, createRecurringEvents } from '../../services/database';
import { notify } from '../../services/ui';

const PROJECT_COLORS = {
  iris: Colors.sage,
  evergreen: Colors.green,
  hydro: Colors.sky,
};

const PROJECTS = [
  { key: 'iris',      label: 'IRIS (food rescue)' },
  { key: 'evergreen', label: 'Evergreen (trees)' },
  { key: 'hydro',     label: 'Hydro (water)' },
  { key: 'general',   label: 'General' },
];

export default function PresEvents({ navigation }) {
  const user = useAuthStore((s) => s.user);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCompose, setShowCompose] = useState(false);
  const [saving, setSaving] = useState(false);

  const blank = {
    title: '', date: '', time: '', location: '', project: 'iris',
    spots: '', description: '',
    recurring: false, recurringWeeks: '8',
  };
  const [form, setForm] = useState(blank);

  const load = useCallback(async () => {
    try {
      // Guard: fetchEvents(undefined) returns EVERY event org-wide,
      // so a pres without a chapter_id stamped would see (and try
      // to edit) every chapter's events. Bail to an empty list and
      // let the render show a "set your chapter first" state.
      if (!user?.chapter_id) { setEvents([]); setLoading(false); return; }
      const list = await fetchEvents(user.chapter_id);
      setEvents(list || []);
    } catch {}
    setLoading(false);
  }, [user?.chapter_id]);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  function fmtDate(d) {
    if (!d) return '';
    return new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  async function handleCreate() {
    if (!form.title.trim() || !form.date.trim()) {
      notify('Required', 'Title and date are required.');
      return;
    }
    setSaving(true);
    try {
      const template = {
        title: form.title.trim(),
        date: form.date.trim(),
        time: form.time.trim(),
        location: form.location.trim(),
        project: form.project,
        description: form.description.trim(),
        spots: parseInt(form.spots, 10) || 0,
        chapter_id: user?.chapter_id || null,
      };
      if (form.recurring) {
        const count = Math.max(1, Math.min(52, parseInt(form.recurringWeeks, 10) || 8));
        const { count: made } = await createRecurringEvents(template, { every: 'week', count });
        notify('Series created', `${made} weekly events were scheduled.`);
      } else {
        await createEvent(template);
        notify('Event created', "It's on the chapter calendar.");
      }
      setShowCompose(false);
      setForm(blank);
      load();
    } catch (e) {
      notify('Could not save', e?.message || 'Try again.');
    } finally { setSaving(false); }
  }

  return (
    <Screen contentStyle={styles.content}>
      <ResponsiveContainer maxWidth={900}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>

        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <BrushText variant="screenTitle" style={styles.title}>Chapter Events</BrushText>
            <Text style={styles.subtitle}>Upcoming events for your chapter</Text>
          </View>
          <TouchableOpacity style={styles.newBtn} onPress={() => { setForm(blank); setShowCompose(true); }}>
            <Text style={styles.newBtnText}>+ New event</Text>
          </TouchableOpacity>
        </View>

        {loading ? null : events.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No upcoming events yet. Tap “New event” to schedule one.</Text>
          </View>
        ) : (
          events.map((ev) => (
            <View
              key={ev.id}
              style={[styles.card, { borderLeftColor: PROJECT_COLORS[ev.project] || Colors.sage }]}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.eventTitle}>
                  {ev.title}{ev.series_id ? <Text style={styles.recur}>  · weekly</Text> : null}
                </Text>
                <View style={styles.spotsBadge}>
                  <Text style={styles.spotsText}>{ev.filled_spots ?? 0}/{ev.spots ?? 0}</Text>
                </View>
              </View>
              <Text style={styles.eventMeta}>
                {fmtDate(ev.date)}{ev.time ? ` · ${ev.time}` : ''}
              </Text>
              {ev.location ? <Text style={styles.eventLocation}>📍 {ev.location}</Text> : null}
              {ev.description ? (
                <Text style={styles.eventDesc} numberOfLines={2}>{ev.description}</Text>
              ) : null}
              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.checkInBtn]}
                  onPress={() => navigation.navigate('CheckIn', { event: ev })}
                >
                  <Text style={[styles.actionText, styles.checkInText]}>Check in attendees</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}

        <Modal visible={showCompose} transparent animationType="fade" onRequestClose={() => setShowCompose(false)}>
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>New event</Text>

              <Text style={styles.label}>Title *</Text>
              <TextInput style={styles.input} value={form.title} onChangeText={(v) => setForm((p) => ({ ...p, title: v }))} placeholder="Weekly produce pickup" />

              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Date * (YYYY-MM-DD)</Text>
                  <TextInput style={styles.input} value={form.date} onChangeText={(v) => setForm((p) => ({ ...p, date: v }))} placeholder="2026-06-10" autoCapitalize="none" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Time</Text>
                  <TextInput style={styles.input} value={form.time} onChangeText={(v) => setForm((p) => ({ ...p, time: v }))} placeholder="8:00 PM" />
                </View>
              </View>

              <Text style={styles.label}>Location</Text>
              <TextInput style={styles.input} value={form.location} onChangeText={(v) => setForm((p) => ({ ...p, location: v }))} placeholder="2150 Young Ave, Memphis" />

              <Text style={styles.label}>Project</Text>
              <View style={styles.chipRow}>
                {PROJECTS.map((p) => (
                  <TouchableOpacity
                    key={p.key}
                    style={[styles.chip, form.project === p.key && styles.chipActive]}
                    onPress={() => setForm((s) => ({ ...s, project: p.key }))}
                  >
                    <Text style={[styles.chipText, form.project === p.key && styles.chipTextActive]}>{p.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Spots</Text>
                  <TextInput style={styles.input} value={form.spots} onChangeText={(v) => setForm((p) => ({ ...p, spots: v }))} placeholder="10" keyboardType="number-pad" />
                </View>
              </View>

              <Text style={styles.label}>Description</Text>
              <TextInput
                style={[styles.input, { minHeight: 70, textAlignVertical: 'top' }]}
                multiline
                value={form.description}
                onChangeText={(v) => setForm((p) => ({ ...p, description: v }))}
                placeholder="What to bring, how to park, who to ask for."
              />

              <TouchableOpacity
                style={[styles.recurToggle, form.recurring && styles.recurToggleOn]}
                onPress={() => setForm((p) => ({ ...p, recurring: !p.recurring }))}
              >
                <View style={[styles.recurBox, form.recurring && styles.recurBoxOn]}>
                  {form.recurring ? <Text style={styles.recurCheck}>✓</Text> : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.recurTitle}>Repeat weekly</Text>
                  <Text style={styles.recurHelp}>
                    Creates the event every 7 days for the number of weeks below. Each occurrence is its own card so you can cancel one without breaking the series.
                  </Text>
                </View>
              </TouchableOpacity>

              {form.recurring ? (
                <View style={{ marginTop: 6 }}>
                  <Text style={styles.label}>Weeks</Text>
                  <TextInput
                    style={[styles.input, { maxWidth: 100 }]}
                    keyboardType="number-pad"
                    value={form.recurringWeeks}
                    onChangeText={(v) => setForm((p) => ({ ...p, recurringWeeks: v }))}
                  />
                </View>
              ) : null}

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 18 }}>
                <Button title="Cancel" variant="secondary" onPress={() => setShowCompose(false)} style={{ flex: 1 }} />
                <Button title={form.recurring ? 'Create series' : 'Create event'} onPress={handleCreate} loading={saving} style={{ flex: 1 }} />
              </View>
            </View>
          </View>
        </Modal>
      </ResponsiveContainer>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream, ...(Platform.OS === 'web' ? { height: '100vh' } : null) },
  content: { padding: 24, paddingTop: 60, paddingBottom: 60 },
  back: { fontSize: 16, color: Colors.green, marginBottom: 8 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 18, flexWrap: 'wrap' },
  title: { color: Colors.green, marginBottom: 6 },
  subtitle: { ...Type.body, color: Colors.gray },
  newBtn: { backgroundColor: Colors.green, paddingVertical: 12, paddingHorizontal: 18, borderRadius: Radius.pill },
  newBtnText: { color: '#FFF', fontWeight: '800', fontSize: 14 },

  empty: { padding: 24, alignItems: 'center', backgroundColor: Colors.white, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.glassBorder },
  emptyText: { ...Type.body, color: Colors.gray, textAlign: 'center' },

  card: { backgroundColor: Colors.white, borderRadius: Radius.xl, padding: 16, marginBottom: 12, borderLeftWidth: 4, ...Shadows.card },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 },
  eventTitle: { fontSize: 17, fontWeight: '800', color: Colors.dark, flex: 1 },
  recur: { fontSize: 11, color: Colors.pink, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  spotsBadge: { backgroundColor: '#F7F5EF', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  spotsText: { fontSize: 12, fontWeight: '700', color: Colors.gray },
  eventMeta: { ...Type.caption, marginTop: 4 },
  eventLocation: { ...Type.caption, marginTop: 2 },
  eventDesc: { ...Type.body, color: Colors.gray, marginTop: 8 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: Radius.pill, backgroundColor: '#F7F5EF' },
  actionText: { fontSize: 12, fontWeight: '700', color: Colors.gray },
  checkInBtn: { backgroundColor: Colors.green },
  checkInText: { color: '#FFF' },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15,28,21,0.45)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modalCard: { width: '100%', maxWidth: 560, backgroundColor: Colors.white, borderRadius: Radius.xl, padding: 22, maxHeight: '90%' },
  modalTitle: { fontSize: 20, fontWeight: '800', color: Colors.green, marginBottom: 4 },
  label: { fontSize: 12, fontWeight: '700', color: Colors.gray, marginTop: 12, marginBottom: 4, letterSpacing: 0.4, textTransform: 'uppercase' },
  input: { borderWidth: 1, borderColor: Colors.glassBorder, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: Colors.dark, backgroundColor: '#FAF8F1' },
  chipRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  chip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, backgroundColor: '#F7F5EF' },
  chipActive: { backgroundColor: Colors.green },
  chipText: { fontSize: 12, fontWeight: '700', color: Colors.gray },
  chipTextActive: { color: '#FFF' },

  recurToggle: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginTop: 16, padding: 12, borderRadius: 12, backgroundColor: '#F7F5EF', borderWidth: 1, borderColor: Colors.glassBorder },
  recurToggleOn: { backgroundColor: '#E8F5EE', borderColor: Colors.green },
  recurBox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: Colors.grayMid, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  recurBoxOn: { backgroundColor: Colors.green, borderColor: Colors.green },
  recurCheck: { color: '#FFF', fontSize: 13, fontWeight: '900' },
  recurTitle: { fontSize: 14, fontWeight: '800', color: Colors.dark },
  recurHelp: { ...Type.caption, color: Colors.gray, marginTop: 2 },
});
