import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import StatCard from '../../components/ui/StatCard';
import ResponsiveContainer from '../../components/ui/ResponsiveContainer';
import useBreakpoint from '../../hooks/useBreakpoint';
import useAuthStore from '../../store/authStore';
import { signOut } from '../../services/auth';
import { payWithApplePay, isApplePayAvailable } from '../../services/payments';
import { recordDonation, fetchDonationHistory, fetchPickups } from '../../services/database';

export default function RestDashboard({ navigation }) {
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.signOut);
  const { isWide } = useBreakpoint();
  const [history, setHistory] = useState([]);
  const [meals, setMeals] = useState(0);

  useEffect(() => {
    fetchDonationHistory(user?.id).then(setHistory).catch(() => {});
    fetchPickups()
      .then((pickups) => {
        const total = pickups.reduce(
          (sum, p) => sum + Math.round((p.estimated_weight_lbs || 0) * 1.2),
          0
        );
        setMeals(total);
      })
      .catch(() => {});
  }, []);

  function handleSignOut() {
    Alert.alert('Sign Out', 'Sign out of the restaurant portal?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          clearAuth();
        },
      },
    ]);
  }

  async function handleSponsorDonation() {
    if (!isApplePayAvailable) {
      Alert.alert('Apple Pay unavailable', 'Apple Pay is only available on iOS.');
      return;
    }
    const result = await payWithApplePay({
      amount: 50,
      label: 'Restaurant Sponsorship',
    });
    if (result.ok) {
      await recordDonation({
        user_id: user?.id,
        amount: 50,
        recurring: false,
        method: 'apple_pay',
        source: 'restaurant_sponsorship',
        status: 'succeeded',
        created_at: new Date().toISOString(),
      });
      Alert.alert('Thank you!', 'Your $50 sponsorship has been processed.');
    }
  }

  const tools = [
    {
      key: 'schedule',
      emoji: '📦',
      title: 'Schedule a Pickup',
      desc: 'Set up a new food pickup for volunteers',
      onPress: () => navigation.navigate('ScheduleDonation'),
    },
    {
      key: 'history',
      emoji: '📋',
      title: 'Donation History',
      desc: 'View past pickups and ratings',
      onPress: () => navigation.navigate('DonationHistory'),
    },
    {
      key: 'receipts',
      emoji: '🧾',
      title: 'Tax Receipts',
      desc: 'IRS-style receipts for every pickup',
      onPress: () => navigation.navigate('TaxReceipts'),
    },
    {
      key: 'settings',
      emoji: '⚙️',
      title: 'Restaurant Settings',
      desc: 'Hours, contact info, preferences',
      onPress: () => navigation.navigate('Settings'),
    },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ResponsiveContainer maxWidth={1000}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>Restaurant Partner</Text>
            <BrushText variant="screenTitle" style={styles.title}>
              {user?.name || 'Restaurant Dashboard'}
            </BrushText>
            <Text style={styles.subtitle}>Manage your food donations</Text>
          </View>
          <TouchableOpacity onPress={handleSignOut} style={styles.signOutBtn}>
            <Text style={styles.signOut}>Sign out</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.statsRow}>
          <StatCard number={String(history.length)} label="Donations" color={Colors.sage} style={styles.stat} />
          <StatCard number={String(meals)} label="Meals Rescued" color={Colors.green} style={styles.stat} />
          <StatCard number="5.0" label="Rating" color={Colors.pink} style={styles.stat} />
        </View>

        <TouchableOpacity
          style={styles.applePayCard}
          onPress={handleSponsorDonation}
          activeOpacity={0.85}
        >
          <View style={styles.applePayLeft}>
            <Text style={styles.applePayGlyph}>Pay</Text>
            <View>
              <Text style={styles.applePayTitle}>Sponsor with Apple Pay</Text>
              <Text style={styles.applePayDesc}>Contribute $50 to your local chapter</Text>
            </View>
          </View>
          <Text style={styles.applePayArrow}>›</Text>
        </TouchableOpacity>

        <BrushText variant="sectionHeader" style={styles.sectionHeader}>
          Quick Actions
        </BrushText>

        <View style={[styles.toolGrid, isWide && styles.toolGridWide]}>
          {tools.map((t) => (
            <TouchableOpacity
              key={t.key}
              style={[styles.toolCard, isWide && styles.toolCardWide]}
              activeOpacity={0.8}
              onPress={t.onPress}
            >
              <Text style={styles.toolEmoji}>{t.emoji}</Text>
              <Text style={styles.toolTitle}>{t.title}</Text>
              <Text style={styles.toolDesc}>{t.desc}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ResponsiveContainer>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  content: { padding: 24, paddingTop: 60, paddingBottom: 60 },
  header: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 24 },
  eyebrow: { fontSize: 12, color: Colors.sage, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  title: { color: Colors.green, marginTop: 4 },
  subtitle: { ...Type.body, color: Colors.gray, marginTop: 4 },
  signOutBtn: { paddingVertical: 6, paddingHorizontal: 10 },
  signOut: { fontSize: 13, color: Colors.pink, fontWeight: '600' },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  stat: { flex: 1 },

  applePayCard: {
    backgroundColor: '#000',
    borderRadius: Radius.lg,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 28,
    ...Shadows.card,
  },
  applePayLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  applePayGlyph: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    fontStyle: 'italic',
    marginRight: 16,
    letterSpacing: -0.5,
  },
  applePayTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  applePayDesc: { color: '#C8DDD4', fontSize: 13, marginTop: 2 },
  applePayArrow: { color: '#fff', fontSize: 26 },

  sectionHeader: { color: Colors.green, marginBottom: 12 },
  toolGrid: {
    flexDirection: 'column',
    gap: 12,
  },
  toolGridWide: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  toolCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: 20,
    ...Shadows.card,
  },
  toolCardWide: {
    flexBasis: '31%',
    flexGrow: 1,
    minWidth: 240,
  },
  toolEmoji: { fontSize: 30, marginBottom: 8 },
  toolTitle: { fontSize: 16, fontWeight: '700', color: Colors.dark },
  toolDesc: { ...Type.caption, marginTop: 4 },
});
