import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import Button from '../../components/ui/Button';
import ProjectTag from '../../components/ui/ProjectTag';
import useAuthStore from '../../store/authStore';
import { signUpForEvent, cancelEventSignup, getUserSignups, fetchEventSignups } from '../../services/database';
import { scheduleEventReminders } from '../../services/notifications';

export default function EventDetailScreen({ navigation, route }) {
  const { event } = route.params;
  const user = useAuthStore((s) => s.user);
  const [isSignedUp, setIsSignedUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [spots, setSpots] = useState(
    (event.total_spots || 20) - (event.filled_spots || 0)
  );
  const [attendees, setAttendees] = useState([]);
  const [attendeesLoading, setAttendeesLoading] = useState(true);

  useEffect(() => {
    checkSignup();
    loadAttendees();
  }, []);

  async function checkSignup() {
    if (!user?.id) return;
    try {
      const signups = await getUserSignups(user.id);
      setIsSignedUp(signups.includes(event.id));
    } catch {}
  }

  async function loadAttendees() {
    setAttendeesLoading(true);
    try {
      const data = await fetchEventSignups(event.id);
      setAttendees(data || []);
    } catch {}
    setAttendeesLoading(false);
  }

  async function handleSignUp() {
    if (!user?.id) return;
    setLoading(true);
    try {
      await signUpForEvent(event.id, user.id);
      setIsSignedUp(true);
      setSpots((s) => s - 1);
      await scheduleEventReminders(event);
      await loadAttendees(); // refresh list
      Alert.alert('Signed Up!', "You're in! Check your calendar for reminders.");
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to sign up');
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel() {
    Alert.alert('Cancel Signup', 'Remove yourself from this event?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes, Cancel',
        style: 'destructive',
        onPress: async () => {
          setLoading(true);
          try {
            await cancelEventSignup(event.id, user.id);
            setIsSignedUp(false);
            setSpots((s) => s + 1);
            await loadAttendees(); // refresh list
          } catch (e) {
            Alert.alert('Error', e.message);
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  }

  const projectColor = Colors.project[event.project]?.primary || Colors.sage;
  const signedUp = attendees.filter((a) => a.status === 'signed_up');
  const checkedIn = attendees.filter((a) => a.status === 'checked_in');
  const noShows = attendees.filter((a) => a.status === 'no_show');

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Text style={styles.back}>{'\u2039'} Back</Text>
      </TouchableOpacity>

      <ProjectTag project={event.project} style={styles.tag} />

      <BrushText variant="screenTitle" style={styles.title}>
        {event.title}
      </BrushText>

      {/* Details Card */}
      <View style={styles.detailsCard}>
        <DetailRow icon={'\u{1F4C5}'} label="Date" value={event.date} color={projectColor} />
        {event.time && <DetailRow icon={'\u{1F550}'} label="Time" value={event.time} color={projectColor} />}
        {event.location && <DetailRow icon={'\u{1F4CD}'} label="Location" value={event.location} color={projectColor} />}
        <DetailRow
          icon={'\u{1F465}'}
          label="Spots"
          value={`${spots} of ${event.total_spots || 20} available`}
          color={spots <= 3 ? Colors.pink : projectColor}
        />
      </View>

      {/* Description */}
      {event.description && (
        <>
          <BrushText variant="sectionHeader" style={styles.sectionTitle}>
            About This Event
          </BrushText>
          <Text style={styles.description}>{event.description}</Text>
        </>
      )}

      {/* Attendees Section */}
      <BrushText variant="sectionHeader" style={styles.sectionTitle}>
        Who's Going
      </BrushText>

      {attendeesLoading ? (
        <View style={styles.attendeesLoading}>
          <ActivityIndicator color={Colors.green} />
        </View>
      ) : attendees.length === 0 ? (
        <View style={styles.noAttendeesCard}>
          <Text style={styles.noAttendeesEmoji}>{'\u{1F331}'}</Text>
          <Text style={styles.noAttendeesText}>
            Be the first to sign up!
          </Text>
        </View>
      ) : (
        <View style={styles.attendeesCard}>
          {/* Summary bar */}
          <View style={styles.attendeeSummary}>
            <View style={styles.summaryItem}>
              <View style={[styles.summaryDot, { backgroundColor: Colors.green }]} />
              <Text style={styles.summaryText}>{checkedIn.length} checked in</Text>
            </View>
            <View style={styles.summaryItem}>
              <View style={[styles.summaryDot, { backgroundColor: Colors.amber }]} />
              <Text style={styles.summaryText}>{signedUp.length} signed up</Text>
            </View>
            {noShows.length > 0 && (
              <View style={styles.summaryItem}>
                <View style={[styles.summaryDot, { backgroundColor: Colors.grayMid }]} />
                <Text style={styles.summaryText}>{noShows.length} no-show</Text>
              </View>
            )}
          </View>

          {/* Checked in list */}
          {checkedIn.length > 0 && (
            <>
              <Text style={styles.attendeeGroupLabel}>Checked In</Text>
              {checkedIn.map((a) => (
                <AttendeeRow key={a.id || a.user_id} attendee={a} status="checked_in" isMe={a.user_id === user?.id} />
              ))}
            </>
          )}

          {/* Signed up list */}
          {signedUp.length > 0 && (
            <>
              <Text style={styles.attendeeGroupLabel}>Signed Up</Text>
              {signedUp.map((a) => (
                <AttendeeRow key={a.id || a.user_id} attendee={a} status="signed_up" isMe={a.user_id === user?.id} />
              ))}
            </>
          )}
        </View>
      )}

      {/* Action Button */}
      {isSignedUp ? (
        <View style={styles.signedUpWrap}>
          <LinearGradient
            colors={Colors.gradient.green}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.signedUpBanner}
          >
            <Text style={styles.signedUpCheck}>{'\u2713'}</Text>
            <Text style={styles.signedUpText}>You're signed up!</Text>
          </LinearGradient>
          <Button
            title="Cancel Signup"
            variant="secondary"
            onPress={handleCancel}
            loading={loading}
            style={styles.cancelBtn}
          />
          <Button
            title="Add to Calendar"
            variant="small"
            onPress={() => Alert.alert('Calendar', 'Calendar sync coming soon!')}
            style={styles.calendarBtn}
          />
        </View>
      ) : (
        <Button
          title={spots > 0 ? 'Sign Up for This Event' : 'Event Full'}
          onPress={handleSignUp}
          loading={loading}
          disabled={spots <= 0}
          style={styles.signUpBtn}
        />
      )}
    </ScrollView>
  );
}

function DetailRow({ icon, label, value, color }) {
  return (
    <View style={styles.detailRow}>
      <View style={[styles.detailIconWrap, { backgroundColor: color + '12' }]}>
        <Text style={styles.detailIcon}>{icon}</Text>
      </View>
      <View>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{value}</Text>
      </View>
    </View>
  );
}

function AttendeeRow({ attendee, status, isMe }) {
  const statusConfig = {
    checked_in: { color: Colors.green, bg: Colors.greenLight, label: 'Checked in' },
    signed_up: { color: Colors.amber, bg: Colors.amberLight, label: 'Signed up' },
  };
  const cfg = statusConfig[status] || statusConfig.signed_up;
  const name = attendee.user_name || attendee.name || 'Volunteer';

  return (
    <View style={[styles.attendeeRow, isMe && styles.attendeeRowMe]}>
      <LinearGradient
        colors={isMe ? Colors.gradient.green : [cfg.bg, cfg.bg]}
        style={styles.attendeeAvatar}
      >
        <Text style={[styles.attendeeInitial, isMe && { color: Colors.white }]}>
          {name[0]?.toUpperCase() || '?'}
        </Text>
      </LinearGradient>
      <View style={{ flex: 1 }}>
        <Text style={styles.attendeeName}>
          {name}{isMe ? ' (you)' : ''}
        </Text>
      </View>
      <View style={[styles.statusPill, { backgroundColor: cfg.bg }]}>
        <View style={[styles.statusDot, { backgroundColor: cfg.color }]} />
        <Text style={[styles.statusLabel, { color: cfg.color }]}>{cfg.label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  content: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  back: { fontSize: 16, color: Colors.green, marginBottom: 12, fontWeight: '500' },
  tag: { marginBottom: 8 },
  title: { color: Colors.green },

  detailsCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: 20,
    marginTop: 20,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    ...Shadows.card,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  detailIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  detailIcon: { fontSize: 18 },
  detailLabel: { ...Type.caption, fontSize: 11 },
  detailValue: { fontSize: 15, fontWeight: '600', color: Colors.dark, marginTop: 2 },

  sectionTitle: { color: Colors.green, marginTop: 28, marginBottom: 10 },
  description: { ...Type.body, color: Colors.gray, lineHeight: 22 },

  // Attendees
  attendeesLoading: { paddingVertical: 20, alignItems: 'center' },
  noAttendeesCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    ...Shadows.soft,
  },
  noAttendeesEmoji: { fontSize: 32, marginBottom: 10 },
  noAttendeesText: { fontSize: 14, color: Colors.gray, fontWeight: '500' },

  attendeesCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    ...Shadows.card,
  },
  attendeeSummary: {
    flexDirection: 'row',
    gap: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.grayLight + '60',
    marginBottom: 10,
  },
  summaryItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  summaryDot: { width: 7, height: 7, borderRadius: 3.5 },
  summaryText: { fontSize: 12, fontWeight: '600', color: Colors.gray },

  attendeeGroupLabel: {
    ...Type.eyebrow,
    color: Colors.grayMid,
    fontSize: 10,
    marginTop: 10,
    marginBottom: 8,
  },
  attendeeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 12,
  },
  attendeeRowMe: {
    backgroundColor: Colors.greenLight + '60',
    marginHorizontal: -10,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  attendeeAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attendeeInitial: { fontSize: 14, fontWeight: '800', color: Colors.green },
  attendeeName: { fontSize: 14, fontWeight: '600', color: Colors.dark },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  statusDot: { width: 5, height: 5, borderRadius: 2.5 },
  statusLabel: { fontSize: 10, fontWeight: '700' },

  // Action
  signUpBtn: { marginTop: 32 },
  signedUpWrap: { marginTop: 32, alignItems: 'center' },
  signedUpBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    paddingVertical: 14,
    borderRadius: Radius.lg,
    marginBottom: 14,
  },
  signedUpCheck: { color: Colors.white, fontSize: 18, fontWeight: '800' },
  signedUpText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.white,
  },
  cancelBtn: { width: '100%' },
  calendarBtn: { marginTop: 12 },
});
