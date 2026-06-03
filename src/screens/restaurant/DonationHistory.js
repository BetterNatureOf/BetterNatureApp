import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import Card from '../../components/ui/Card';
import useAuthStore from '../../store/authStore';
import { fetchPickups, fetchDonationHistory } from '../../services/database';
import Screen from '../../components/ui/Screen';

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function DonationHistory({ navigation }) {
  const user = useAuthStore((s) => s.user);
  const [pickups, setPickups] = useState([]);
  const [sponsorships, setSponsorships] = useState([]);

  useEffect(() => {
    fetchPickups()
      .then(setPickups)
      .catch(() => {});
    fetchDonationHistory(user?.id)
      .then(setSponsorships)
      .catch(() => {});
  }, []);

  const isEmpty = pickups.length === 0 && sponsorships.length === 0;

  return (
    <Screen contentStyle={styles.content}>
      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Text style={styles.back}>‹ Back</Text>
      </TouchableOpacity>
      <BrushText variant="screenTitle" style={styles.title}>
        Donation History
      </BrushText>
      <Text style={styles.subtitle}>Pickups and sponsorships from your restaurant</Text>

      {isEmpty ? (
        <Card style={styles.emptyCard}>
          <Text style={styles.emptyEmoji}>📋</Text>
          <Text style={styles.emptyText}>No donations yet</Text>
          <Text style={styles.emptySubtext}>
            Schedule your first pickup or sponsorship to start making an impact!
          </Text>
        </Card>
      ) : (
        <>
          {pickups.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>Food Pickups</Text>
              {pickups.map((p) => (
                <View key={p.id} style={[styles.row, { borderLeftColor: Colors.sage }]}>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle}>{p.restaurant_name}</Text>
                    <Text style={styles.rowMeta}>
                      {fmtDate(p.scheduled_date)} · {p.scheduled_time}
                    </Text>
                    <Text style={styles.rowMeta}>{p.estimated_weight_lbs} lbs estimated</Text>
                  </View>
                  <View style={[styles.statusBadge, statusStyle(p.status)]}>
                    <Text style={[styles.statusText, statusTextStyle(p.status)]}>{p.status}</Text>
                  </View>
                </View>
              ))}
            </>
          )}

          {sponsorships.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>Sponsorships</Text>
              {sponsorships.map((d) => (
                <View key={d.id} style={[styles.row, { borderLeftColor: Colors.pink }]}>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle}>${d.amount} sponsorship</Text>
                    <Text style={styles.rowMeta}>{fmtDate(d.created_at)} · Apple Pay</Text>
                  </View>
                  <View style={[styles.statusBadge, statusStyle('succeeded')]}>
                    <Text style={[styles.statusText, statusTextStyle('succeeded')]}>paid</Text>
                  </View>
                </View>
              ))}
            </>
          )}
        </>
      )}
    </Screen>
  );
}

function statusStyle(status) {
  if (status === 'completed' || status === 'succeeded') return { backgroundColor: Colors.greenLight };
  if (status === 'available' || status === 'claimed') return { backgroundColor: Colors.sageLight };
  return { backgroundColor: Colors.grayLight };
}

function statusTextStyle(status) {
  if (status === 'completed' || status === 'succeeded') return { color: Colors.green };
  if (status === 'available' || status === 'claimed') return { color: Colors.sage };
  return { color: Colors.gray };
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
    ...(Platform.OS === 'web' ? { height: '100vh' } : null),
  },
  content: { padding: 24, paddingTop: 60, paddingBottom: 60 },
  back: { fontSize: 16, color: Colors.green, marginBottom: 8 },
  title: { color: Colors.green },
  subtitle: { ...Type.body, color: Colors.gray, marginTop: 4, marginBottom: 24 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.gray,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 8,
    marginBottom: 10,
  },
  emptyCard: { alignItems: 'center', padding: 40 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 15, fontWeight: '500', color: Colors.dark },
  emptySubtext: { ...Type.caption, marginTop: 4, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderLeftWidth: 4,
    padding: 16,
    marginBottom: 8,
    ...Shadows.card,
  },
  rowBody: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '700', color: Colors.dark },
  rowMeta: { ...Type.caption, marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
});
