import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import StatCard from '../../components/ui/StatCard';
import Card from '../../components/ui/Card';

export default function RestDashboard({ navigation }) {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <BrushText variant="screenTitle" style={styles.title}>
        Restaurant Dashboard
      </BrushText>
      <Text style={styles.subtitle}>Manage your food donations</Text>

      <View style={styles.statsRow}>
        <StatCard number="0" label="Total Donations" color={Colors.sage} style={styles.stat} />
        <StatCard number="0" label="Meals Rescued" color={Colors.green} style={styles.stat} />
        <StatCard number="5.0" label="Rating" color={Colors.pink} style={styles.stat} />
      </View>

      <TouchableOpacity
        style={styles.actionCard}
        onPress={() => navigation.navigate('ScheduleDonation')}
        activeOpacity={0.7}
      >
        <Text style={styles.actionEmoji}>📦</Text>
        <View style={styles.actionText}>
          <Text style={styles.actionTitle}>Schedule a Donation</Text>
          <Text style={styles.actionDesc}>Set up a new food pickup for volunteers</Text>
        </View>
        <Text style={styles.arrow}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.actionCard}
        onPress={() => navigation.navigate('DonationHistory')}
        activeOpacity={0.7}
      >
        <Text style={styles.actionEmoji}>📋</Text>
        <View style={styles.actionText}>
          <Text style={styles.actionTitle}>Donation History</Text>
          <Text style={styles.actionDesc}>View past donations and volunteer ratings</Text>
        </View>
        <Text style={styles.arrow}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.actionCard} activeOpacity={0.7}>
        <Text style={styles.actionEmoji}>⚙️</Text>
        <View style={styles.actionText}>
          <Text style={styles.actionTitle}>Restaurant Settings</Text>
          <Text style={styles.actionDesc}>Update hours, contact info, preferences</Text>
        </View>
        <Text style={styles.arrow}>›</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  content: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  title: { color: Colors.green },
  subtitle: { ...Type.body, color: Colors.gray, marginTop: 4, marginBottom: 24 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  stat: { flex: 1 },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: 18,
    marginBottom: 12,
    ...Shadows.card,
  },
  actionEmoji: { fontSize: 28, marginRight: 16 },
  actionText: { flex: 1 },
  actionTitle: { fontSize: 16, fontWeight: '700', color: Colors.dark },
  actionDesc: { ...Type.caption, marginTop: 2 },
  arrow: { fontSize: 24, color: Colors.grayMid },
});
