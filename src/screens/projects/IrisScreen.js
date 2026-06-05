import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  RefreshControl,
  Platform,
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
import { getOrgStats } from '../../services/orgStats';
import { fetchRestaurants, fetchAllMembers } from '../../services/database';
import { requireVerifiedId } from '../../services/idGate';
import PickupCard from '../../components/pickup/PickupCard';
import Icon from '../../components/ui/Icon';
import AnimatedPressable from '../../components/ui/AnimatedPressable';
import ProjectLogo from '../../components/ui/ProjectLogo';
import Screen from '../../components/ui/Screen';
import FridgeNetworkMap from '../../components/maps/FridgeNetworkMap';
import FridgeLeafletMap from '../../components/maps/FridgeLeafletMap';
import { loadLiveFridges } from '../../data/impactMap';

const fmt = (n) => (!n ? '0' : n.toLocaleString('en-US'));

export default function IrisScreen({ navigation }) {
  const { pickups, loading: pickupsLoading, loadPickups, claim } = usePickups();
  const { events } = useEvents();
  const user = useAuthStore((s) => s.user);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({ meals: 0 });
  const [partners, setPartners] = useState(0);
  const [volunteers, setVolunteers] = useState(0);
  const [liveFridges, setLiveFridges] = useState([]);

  useEffect(() => {
    getOrgStats().then(setStats).catch(() => {});
    fetchRestaurants('approved').then((r) => setPartners(r.length)).catch(() => {});
    fetchAllMembers().then((m) => setVolunteers(m.length)).catch(() => {});
    loadLiveFridges().then(setLiveFridges).catch(() => {});
  }, []);

  const irisEvents = events.filter((e) => e.project === 'IRIS');

  async function onRefresh() {
    setRefreshing(true);
    await loadPickups();
    setRefreshing(false);
  }

  async function handleClaim(pickupId) {
    if (!requireVerifiedId(user, navigation)) return;
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

  const Body = Platform.OS === 'web'
    ? ({ children }) => React.createElement(
        'div',
        {
          style: {
            height: '100vh',
            width: '100%',
            overflowY: 'auto',
            overflowX: 'hidden',
            WebkitOverflowScrolling: 'touch',
            backgroundColor: Colors.cream,
          },
        },
        React.createElement('div', { style: { paddingBottom: 40 } }, children)
      )
    : ({ children }) => (
        <Screen contentStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {children}
        </Screen>
      );

  return (
    <Body>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
        <View style={{ alignItems: 'center', marginTop: 6, marginBottom: 8 }}>
          <ProjectLogo project="iris" size={108} />
        </View>
        <BrushText variant="screenTitle" style={[styles.title, { textAlign: 'center', color: Colors.pink }]}>
          IRIS
        </BrushText>
        <Text style={[styles.subtitle, { textAlign: 'center' }]}>Food Rescue Initiative</Text>
        <Text style={styles.desc}>
          Rescue surplus food from local restaurants and deliver it to communities
          in need. Every meal counts.
        </Text>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <StatCard number={fmt(stats.meals)} label="Meals Rescued" color={Colors.sage} style={styles.stat} />
        <StatCard number={fmt(partners)} label="Partners" color={Colors.sage} style={styles.stat} />
        <StatCard number={fmt(volunteers)} label="Volunteers" color={Colors.sage} style={styles.stat} />
      </View>

      {/* Fridge network preview \u2014 pulled live from Firestore on
          mount; tapping anywhere opens the full BN Map. */}
      <View style={styles.mapPreviewWrap}>
        <View style={styles.mapPreviewHeader}>
          <Text style={styles.mapPreviewEyebrow}>The fridge network</Text>
          <Text style={styles.mapPreviewTitle}>Where surplus food goes</Text>
        </View>
        {Platform.OS === 'web' ? (
          <>
            <FridgeLeafletMap fridges={liveFridges} height={320} />
            <TouchableOpacity
              style={styles.fridgePreviewCta}
              onPress={() => navigation.navigate('BNMap')}
              activeOpacity={0.85}
            >
              <Text style={styles.fridgePreviewCtaText}>Open the full BN Map →</Text>
            </TouchableOpacity>
          </>
        ) : (
          <FridgeNetworkMap
            fridges={liveFridges}
            compact
            onSeeAll={() => navigation.navigate('BNMap')}
          />
        )}
      </View>

      {/* The 'Open the full BN Map \u2192' CTA inside FridgeLeafletMap
          already routes to BNMap, so we don't need a second link
          card here. (Removed per redesign \u2014 was a duplicate.) */}

      <BrushDivider color={Colors.sage} />

      {/* Available Pickups */}
      <BrushText variant="sectionHeader" style={styles.sectionTitle}>
        Available Pickups
      </BrushText>

      {pickups.length === 0 ? (
        <Card style={styles.emptyCard}>
          <Icon name="clipboard" size={36} color={Colors.green} strokeWidth={1.5} />
          <Text style={[styles.emptyText, { marginTop: 10 }]}>No pickups available right now</Text>
          <Text style={styles.emptySubtext}>Check back soon</Text>
        </Card>
      ) : (
        <View style={{ gap: 14 }}>
          {pickups.map((pickup) => (
            <AnimatedPressable
              key={pickup.id}
              onPress={() => navigation.navigate('PickupDetail', { pickupId: pickup.id, pickup })}
              scaleTo={0.99}
            >
              <PickupCard
                pickup={pickup}
                cta={{
                  // Volunteers preview the pickup (photo, exact
                  // address, distance, weight, notes) on the detail
                  // screen BEFORE the claim button is reachable.
                  // 'View details' makes that clear; 'Claim pickup'
                  // on the card incorrectly implied tapping locked
                  // them into a run.
                  label: pickup.status === 'claimed'
                    ? (pickup.claimed_by === user?.id ? 'Open' : 'Already claimed')
                    : 'View details',
                  onPress: () => {
                    // ID gate still applies to claim — but the
                    // preview is open to anyone signed in.
                    navigation.navigate('PickupDetail', { pickupId: pickup.id, pickup });
                  },
                }}
              />
            </AnimatedPressable>
          ))}
        </View>
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
    </Body>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
    ...(Platform.OS === 'web' ? { height: '100vh' } : null),
  },
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
  mapPreviewWrap: {
    marginHorizontal: 24,
    marginTop: 20,
    marginBottom: 8,
    padding: 16,
    backgroundColor: Colors.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    ...Shadows.card,
  },
  mapPreviewHeader: { marginBottom: 12 },
  mapPreviewEyebrow: { ...Type.eyebrow, color: Colors.pink, fontSize: 11 },
  mapPreviewTitle: { fontSize: 18, fontWeight: '800', color: Colors.green, marginTop: 2 },
  fridgePreviewCta: { marginTop: 14, backgroundColor: Colors.green, paddingVertical: 12, borderRadius: 999, alignItems: 'center' },
  fridgePreviewCtaText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  mapCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 24,
    marginTop: 16,
    marginBottom: 8,
    padding: 16,
    backgroundColor: '#FEF2F2',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#FECACA',
    gap: 14,
  },
  mapIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapIcon: { fontSize: 22 },
  mapTitle: { fontSize: 15, fontWeight: '700', color: '#DC2626', letterSpacing: -0.2 },
  mapSubtitle: { fontSize: 12, color: '#9B1C1C', opacity: 0.7, marginTop: 2 },
  mapArrow: { fontSize: 22, color: '#DC2626' },
});
