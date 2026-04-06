import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import Card from '../../components/ui/Card';

export default function GlobalHistory({ navigation }) {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.back} onPress={() => navigation.goBack()}>‹ Back</Text>
      <BrushText variant="screenTitle" style={styles.title}>
        Global History
      </BrushText>
      <Text style={styles.subtitle}>All activity across Better Nature</Text>

      <Card style={styles.emptyCard}>
        <Text style={styles.emptyEmoji}>📊</Text>
        <Text style={styles.emptyText}>Activity feed coming soon</Text>
        <Text style={styles.emptySubtext}>
          This will show a timeline of events, pickups, signups, and donations across all chapters.
        </Text>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  content: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  back: { fontSize: 16, color: Colors.green, marginBottom: 8 },
  title: { color: Colors.green },
  subtitle: { ...Type.body, color: Colors.gray, marginTop: 4, marginBottom: 24 },
  emptyCard: { alignItems: 'center', padding: 40 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 15, fontWeight: '500', color: Colors.dark },
  emptySubtext: { ...Type.caption, marginTop: 4, textAlign: 'center' },
});
