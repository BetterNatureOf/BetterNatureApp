import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';

const REPORTS = [
  { key: 'members', label: 'Member Report', desc: 'All members with roles, chapters, and stats', emoji: '👥' },
  { key: 'events', label: 'Event Report', desc: 'All events with attendance data', emoji: '📅' },
  { key: 'pickups', label: 'Pickup Report', desc: 'Food rescue history and metrics', emoji: '🍽️' },
  { key: 'donations', label: 'Donation Report', desc: 'Monetary donations via Zeffy', emoji: '💰' },
  { key: 'chapters', label: 'Chapter Report', desc: 'Chapter stats and progress', emoji: '📍' },
  { key: 'restaurants', label: 'Restaurant Report', desc: 'Partner restaurants and donation history', emoji: '🏪' },
];

export default function ExportReports({ navigation }) {
  function handleExport(report) {
    Alert.alert(
      `Export ${report.label}`,
      'Choose format:',
      [
        { text: 'PDF', onPress: () => Alert.alert('Coming Soon', 'PDF export will be available soon.') },
        { text: 'CSV', onPress: () => Alert.alert('Coming Soon', 'CSV export will be available soon.') },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.back} onPress={() => navigation.goBack()}>‹ Back</Text>
      <BrushText variant="screenTitle" style={styles.title}>
        Export Reports
      </BrushText>
      <Text style={styles.subtitle}>Generate and download organization reports</Text>

      {REPORTS.map((report) => (
        <TouchableOpacity
          key={report.key}
          style={styles.card}
          onPress={() => handleExport(report)}
          activeOpacity={0.7}
        >
          <Text style={styles.emoji}>{report.emoji}</Text>
          <View style={styles.textWrap}>
            <Text style={styles.label}>{report.label}</Text>
            <Text style={styles.desc}>{report.desc}</Text>
          </View>
          <Text style={styles.arrow}>↓</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  content: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  back: { fontSize: 16, color: Colors.green, marginBottom: 8 },
  title: { color: Colors.green },
  subtitle: { ...Type.body, color: Colors.gray, marginTop: 4, marginBottom: 24 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: 16,
    marginBottom: 10,
    ...Shadows.card,
  },
  emoji: { fontSize: 28, marginRight: 14 },
  textWrap: { flex: 1 },
  label: { fontSize: 15, fontWeight: '700', color: Colors.dark },
  desc: { ...Type.caption, marginTop: 2 },
  arrow: { fontSize: 20, color: Colors.grayMid },
});
