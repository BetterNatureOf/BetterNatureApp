import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import Card from '../../components/ui/Card';

export default function DonationHistory({ navigation }) {
  // Placeholder — would load from database
  const donations = [];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <BrushText variant="screenTitle" style={styles.title}>
        Donation History
      </BrushText>
      <Text style={styles.subtitle}>Your past food donations</Text>

      {donations.length === 0 ? (
        <Card style={styles.emptyCard}>
          <Text style={styles.emptyEmoji}>📋</Text>
          <Text style={styles.emptyText}>No donations yet</Text>
          <Text style={styles.emptySubtext}>
            Schedule your first donation to start making an impact!
          </Text>
        </Card>
      ) : (
        donations.map((d) => (
          <Card key={d.id} accentColor={Colors.sage} style={styles.donationCard}>
            <Text style={styles.donationItems}>{d.items}</Text>
            <Text style={styles.donationDate}>{d.scheduled_date}</Text>
            <View style={styles.statusBadge}>
              <Text style={styles.statusText}>{d.status}</Text>
            </View>
          </Card>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  content: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  title: { color: Colors.green },
  subtitle: { ...Type.body, color: Colors.gray, marginTop: 4, marginBottom: 24 },
  emptyCard: { alignItems: 'center', padding: 40 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 15, fontWeight: '500', color: Colors.dark },
  emptySubtext: { ...Type.caption, marginTop: 4, textAlign: 'center' },
  donationCard: { marginBottom: 12 },
  donationItems: { fontSize: 16, fontWeight: '700', color: Colors.dark },
  donationDate: { ...Type.caption, marginTop: 4 },
  statusBadge: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.greenLight,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 8,
  },
  statusText: { fontSize: 12, fontWeight: '600', color: Colors.green },
});
