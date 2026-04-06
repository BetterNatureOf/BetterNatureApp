import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import Button from '../../components/ui/Button';
import ProjectTag from '../../components/ui/ProjectTag';
import useAuthStore from '../../store/authStore';
import { signUpForEvent, cancelEventSignup, getUserSignups } from '../../services/database';
import { scheduleEventReminders } from '../../services/notifications';

export default function EventDetailScreen({ navigation, route }) {
  const { event } = route.params;
  const user = useAuthStore((s) => s.user);
  const [isSignedUp, setIsSignedUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [spots, setSpots] = useState(
    (event.total_spots || 20) - (event.filled_spots || 0)
  );

  useEffect(() => {
    checkSignup();
  }, []);

  async function checkSignup() {
    if (!user?.id) return;
    try {
      const signups = await getUserSignups(user.id);
      setIsSignedUp(signups.includes(event.id));
    } catch {}
  }

  async function handleSignUp() {
    if (!user?.id) return;
    setLoading(true);
    try {
      await signUpForEvent(event.id, user.id);
      setIsSignedUp(true);
      setSpots((s) => s - 1);
      await scheduleEventReminders(event);
      Alert.alert('Signed Up!', 'You\'re in! Check your calendar for reminders.');
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
          } catch (e) {
            Alert.alert('Error', e.message);
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Text style={styles.back}>‹ Back</Text>
      </TouchableOpacity>

      <ProjectTag project={event.project} style={styles.tag} />

      <BrushText variant="screenTitle" style={styles.title}>
        {event.title}
      </BrushText>

      {/* Details */}
      <View style={styles.detailsCard}>
        <View style={styles.detailRow}>
          <Text style={styles.detailIcon}>📅</Text>
          <View>
            <Text style={styles.detailLabel}>Date</Text>
            <Text style={styles.detailValue}>{event.date}</Text>
          </View>
        </View>

        {event.time && (
          <View style={styles.detailRow}>
            <Text style={styles.detailIcon}>🕐</Text>
            <View>
              <Text style={styles.detailLabel}>Time</Text>
              <Text style={styles.detailValue}>{event.time}</Text>
            </View>
          </View>
        )}

        {event.location && (
          <View style={styles.detailRow}>
            <Text style={styles.detailIcon}>📍</Text>
            <View>
              <Text style={styles.detailLabel}>Location</Text>
              <Text style={styles.detailValue}>{event.location}</Text>
            </View>
          </View>
        )}

        <View style={styles.detailRow}>
          <Text style={styles.detailIcon}>👥</Text>
          <View>
            <Text style={styles.detailLabel}>Spots</Text>
            <Text style={styles.detailValue}>
              {spots} of {event.total_spots || 20} available
            </Text>
          </View>
        </View>
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

      {/* Action Button */}
      {isSignedUp ? (
        <View style={styles.signedUpWrap}>
          <Text style={styles.signedUpText}>✓ You're signed up!</Text>
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
            onPress={() => {
              // Calendar integration placeholder
              Alert.alert('Calendar', 'Calendar sync coming soon!');
            }}
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  content: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  back: { fontSize: 16, color: Colors.pink, marginBottom: 12 },
  tag: { marginBottom: 8 },
  title: { color: Colors.green },
  detailsCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: 20,
    marginTop: 20,
    ...Shadows.card,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  detailIcon: { fontSize: 22, marginRight: 14, width: 30 },
  detailLabel: { ...Type.caption },
  detailValue: { fontSize: 15, fontWeight: '500', color: Colors.dark, marginTop: 1 },
  sectionTitle: { color: Colors.green, marginTop: 24, marginBottom: 8 },
  description: { ...Type.body, color: Colors.gray, lineHeight: 22 },
  signUpBtn: { marginTop: 32 },
  signedUpWrap: { marginTop: 32, alignItems: 'center' },
  signedUpText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.green,
    marginBottom: 12,
  },
  cancelBtn: { width: '100%' },
  calendarBtn: { marginTop: 12 },
});
