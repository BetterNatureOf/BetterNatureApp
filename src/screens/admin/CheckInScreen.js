import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import Button from '../../components/ui/Button';
import ResponsiveContainer from '../../components/ui/ResponsiveContainer';
import useBreakpoint from '../../hooks/useBreakpoint';
import useAuthStore from '../../store/authStore';
import {
  fetchEventSignups,
  checkInVolunteer,
  markNoShow,
} from '../../services/database';

// Pres / exec opens this after an event happens. They see the list of
// signed-up volunteers and tap ✓ (check in) or ✗ (no show). A check-in
// automatically logs the hours + meals to member_activity, which feeds
// the leaderboard.
export default function CheckInScreen({ navigation, route }) {
  const event = route?.params?.event;
  const me = useAuthStore((s) => s.user);
  const { isWide } = useBreakpoint();
  const [signups, setSignups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null); // user_id of row being updated

  const load = useCallback(async () => {
    if (!event) return;
    setLoading(true);
    try {
      const rows = await fetchEventSignups(event.id);
      setSignups(rows);
    } catch (e) {}
    setLoading(false);
  }, [event?.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCheckIn(signup) {
    setBusy(signup.user_id);
    try {
      await checkInVolunteer({
        signupId: signup.id,
        eventId: event.id,
        userId: signup.user_id,
        checkedInBy: me?.id,
        project: event.project || 'general',
        hours: event.hours_per_volunteer || 3,
        meals: event.meals_per_volunteer || 0,
      });
      load();
    } catch (e) {
      Alert.alert('Error', e?.message || 'Check-in failed');
    }
    setBusy(null);
  }

  async function handleNoShow(signup) {
    setBusy(signup.user_id);
    try {
      await markNoShow(signup.id);
      load();
    } catch (e) {
      Alert.alert('Error', e?.message || 'Update failed');
    }
    setBusy(null);
  }

  const checked = signups.filter((s) => s.status === 'checked_in').length;
  const total = signups.length;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ResponsiveContainer maxWidth={700}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>

        <BrushText variant="screenTitle" style={styles.title}>
          Check In
        </BrushText>
        <Text style={styles.eventName}>{event?.title || 'Event'}</Text>
        <Text style={styles.subtitle}>
          {event?.date} · {event?.location || ''}
        </Text>

        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              { width: total > 0 ? `${(checked / total) * 100}%` : '0%' },
            ]}
          />
        </View>
        <Text style={styles.progressText}>
          {checked} of {total} checked in
        </Text>

        {loading && (
          <ActivityIndicator color={Colors.green} style={{ marginTop: 24 }} />
        )}

        {!loading && signups.length === 0 && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyEmoji}>📋</Text>
            <Text style={styles.emptyText}>
              No one has signed up for this event yet.
            </Text>
          </View>
        )}

        <View style={[styles.list, isWide && styles.listWide]}>
          {signups.map((s) => {
            const done = s.status === 'checked_in';
            const noShow = s.status === 'no_show';
            const isBusy = busy === s.user_id;

            return (
              <View
                key={s.id || s.user_id}
                style={[
                  styles.row,
                  done && styles.rowChecked,
                  noShow && styles.rowNoShow,
                  isWide && styles.rowWide,
                ]}
              >
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {s.user_name?.[0] || '?'}
                  </Text>
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.name}>{s.user_name || 'Volunteer'}</Text>
                  <Text style={styles.statusText}>
                    {done
                      ? '✓ Checked in'
                      : noShow
                      ? '✗ No show'
                      : 'Signed up'}
                  </Text>
                </View>

                {!done && !noShow && (
                  <View style={styles.actions}>
                    <TouchableOpacity
                      style={styles.checkBtn}
                      disabled={isBusy}
                      onPress={() => handleCheckIn(s)}
                    >
                      {isBusy ? (
                        <ActivityIndicator size="small" color={Colors.white} />
                      ) : (
                        <Text style={styles.checkBtnText}>✓</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.noShowBtn}
                      disabled={isBusy}
                      onPress={() => handleNoShow(s)}
                    >
                      <Text style={styles.noShowBtnText}>✗</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {done && (
                  <View style={styles.loggedBadge}>
                    <Text style={styles.loggedText}>
                      +{event.hours_per_volunteer || 3}h
                      {(event.meals_per_volunteer || 0) > 0 &&
                        ` · ${event.meals_per_volunteer}m`}
                    </Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {!loading && signups.length > 0 && checked < total && (
          <Button
            title="Check In All Remaining"
            onPress={() => {
              Alert.alert(
                'Check in everyone?',
                'This will mark all remaining signed-up volunteers as checked in.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Check In All',
                    onPress: async () => {
                      for (const s of signups) {
                        if (s.status === 'signed_up') {
                          await handleCheckIn(s);
                        }
                      }
                    },
                  },
                ]
              );
            }}
            style={{ marginTop: 24 }}
          />
        )}

        <Text style={styles.footnote}>
          Checking in a volunteer automatically logs their hours and meals to
          the leaderboard. Only check in people who actually showed up.
        </Text>
      </ResponsiveContainer>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  content: { padding: 24, paddingTop: 60, paddingBottom: 60 },
  back: { fontSize: 16, color: Colors.green, marginBottom: 8 },
  title: { color: Colors.green },
  eventName: { fontSize: 16, fontWeight: '700', color: Colors.dark, marginTop: 4 },
  subtitle: { ...Type.caption, color: Colors.gray, marginTop: 2, marginBottom: 16 },

  progressBar: {
    height: 8,
    backgroundColor: Colors.grayLight,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.green,
    borderRadius: 4,
  },
  progressText: { ...Type.caption, color: Colors.gray, marginBottom: 16 },

  emptyCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: 32,
    alignItems: 'center',
    marginTop: 12,
    ...Shadows.card,
  },
  emptyEmoji: { fontSize: 40, marginBottom: 8 },
  emptyText: { ...Type.body, color: Colors.gray, textAlign: 'center' },

  list: { gap: 10 },
  listWide: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    padding: 14,
    ...Shadows.card,
  },
  rowWide: { flexBasis: '48%', flexGrow: 1 },
  rowChecked: { borderLeftWidth: 4, borderLeftColor: Colors.green },
  rowNoShow: { borderLeftWidth: 4, borderLeftColor: Colors.grayMid, opacity: 0.6 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.sage,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: Colors.white, fontWeight: '800', fontSize: 16 },
  name: { fontSize: 15, fontWeight: '700', color: Colors.dark },
  statusText: { fontSize: 12, color: Colors.gray, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 8 },
  checkBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBtnText: { color: Colors.white, fontSize: 20, fontWeight: '800' },
  noShowBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.grayLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noShowBtnText: { color: Colors.gray, fontSize: 20, fontWeight: '800' },
  loggedBadge: {
    backgroundColor: Colors.greenLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  loggedText: { color: Colors.green, fontSize: 12, fontWeight: '700' },
  footnote: {
    ...Type.caption,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 24,
  },
});
