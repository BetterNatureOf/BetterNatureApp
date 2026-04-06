import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  RefreshControl,
} from 'react-native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import StatCard from '../../components/ui/StatCard';
import EventCard from '../../components/ui/EventCard';
import BrushDivider from '../../components/ui/BrushDivider';
import usePickups from '../../hooks/usePickups';
import useEvents from '../../hooks/useEvents';
import useAuthStore from '../../store/authStore';

export default function IrisScreen({ navigation }) {
  const { pickups, loading: pickupsLoading, loadPickups, claim } = usePickups();
  const { events } = useEvents();
  const user = useAuthStore((s) => s.user);
  const [refreshing, setRefreshing] = useState(false);

  const irisEvents = events.filter((e) => e.project === 'IRIS');

  async function onRefresh() {
    setRefreshing(true);
    await loadPickups();
    setRefreshing(false);
  }

  async function handleClaim(pickupId) {
    Alert.alert(
      'Claim Pickup',
      'Are you sure you want to claim this pickup? The restaurant will receive your contact info.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Claim',
          onPress: async () => {
            try {
              await claim(pickupId);
              Alert.alert('Claimed!', 'You\'ve been assigned this pickup. Check your notifications for details.');
            } catch (e) {
              Alert.alert('Error', 'This pickup may have already been claimed.');
            }
          },
        },
      ]
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
        <BrushText variant="screenTitle" style={styles.title}>
          IRIS
        </BrushText>
        <Text style={styles.subtitle}>Food Rescue Initiative</Text>
        <Text style={styles.desc}>
          Rescue surplus food from local restaurants and deliver it to communities
          in need. Every meal counts.
        </Text>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <StatCard number="2,400+" label="Meals Rescued" color={Colors.sage} style={styles.stat} />
        <StatCard number="45" label="Partners" color={Colors.sage} style={styles.stat} />
        <StatCard number="120+" label="Volunteers" color={Colors.sage} style={styles.stat} />
      </View>

      <BrushDivider color={Colors.sage} />

      {/* Available Pickups */}
      <BrushText variant="sectionHeader" style={styles.sectionTitle}>
        Available Pickups
      </BrushText>

      {pickups.length === 0 ? (
        <Card style={styles.emptyCard}>
          <Text style={styles.emptyEmoji}>🍽️</Text>
          <Text style={styles.emptyText}>No pickups available right now</Text>
          <Text style={styles.emptySubtext}>Check back soon!</Text>
        </Card>
      ) : (
        pickups.map((pickup) => (
          <Card key={pickup.id} accentColor={Colors.sage} style={styles.pickupCard}>
            <Text style={styles.pickupRestaurant}>{pickup.restaurant_name}</Text>
            <Text style={styles.pickupItems}>{pickup.items}</Text>
            <View style={styles.pickupMeta}>
              <Text style={styles.pickupDate}>
                {pickup.scheduled_date} · {pickup.scheduled_time}
              </Text>
              <Text style={styles.pickupQty}>{pickup.quantity}</Text>
            </View>
            {pickup.instructions && (
              <Text style={styles.pickupInstructions}>{pickup.instructions}</Text>
            )}
            <Button
              title={pickup.status === 'claimed' ? 'Claimed ✓' : 'Claim Pickup'}
              variant={pickup.status === 'claimed' ? 'secondary' : 'primary'}
              disabled={pickup.status === 'claimed'}
              onPress={() => handleClaim(pickup.id)}
              style={styles.claimBtn}
            />
          </Card>
        ))
      )}

      <BrushDivider color={Colors.sage} />

      {/* IRIS Events */}
      <BrushText variant="sectionHeader" style={styles.sectionTitle}>
        IRIS Events
      </BrushText>

      {irisEvents.length === 0 ? (
        <Card style={styles.emptyCard}>
          <Text style={styles.emptyText}>No upcoming IRIS events</Text>
        </Card>
      ) : (
        irisEvents.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            onPress={() => navigation.navigate('EventDetail', { event })}
          />
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  content: { paddingBottom: 40 },
  header: { padding: 24, paddingTop: 60 },
  back: { fontSize: 16, color: Colors.sage, marginBottom: 8 },
  title: { color: Colors.sage, fontSize: 36 },
  subtitle: { fontSize: 14, color: Colors.gray, marginTop: 2 },
  desc: { ...Type.body, color: Colors.gray, marginTop: 8, lineHeight: 22 },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    gap: 10,
  },
  stat: { flex: 1 },
  sectionTitle: { color: Colors.sage, paddingHorizontal: 24, marginBottom: 12 },
  emptyCard: { marginHorizontal: 24, alignItems: 'center', padding: 32 },
  emptyEmoji: { fontSize: 40, marginBottom: 8 },
  emptyText: { fontSize: 15, fontWeight: '500', color: Colors.dark },
  emptySubtext: { ...Type.caption, marginTop: 4 },
  pickupCard: { marginHorizontal: 24, marginBottom: 12 },
  pickupRestaurant: { fontSize: 16, fontWeight: '700', color: Colors.dark },
  pickupItems: { ...Type.body, color: Colors.gray, marginTop: 4 },
  pickupMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  pickupDate: { ...Type.caption },
  pickupQty: { ...Type.caption, fontWeight: '600' },
  pickupInstructions: { ...Type.caption, fontStyle: 'italic', marginTop: 6 },
  claimBtn: { marginTop: 12 },
});
