// Home / Dashboard.
//
// TEMPORARY: stripped to a minimal render to isolate the
// "Cannot read properties of undefined (reading '0')" production crash.
// Once we confirm the bare version renders, we'll fold building blocks
// back in one at a time to find the culprit.
import React from 'react';
import { ScrollView, StyleSheet, View, Text, Platform } from 'react-native';
import { Colors } from '../../config/theme';
import useAuthStore from '../../store/authStore';

export default function DashboardScreen({ navigation }) {
  const user = useAuthStore((s) => s.user);
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>HOME</Text>
      <Text style={styles.title}>Welcome, {user?.name || 'volunteer'}</Text>
      <Text style={styles.body}>
        The full dashboard is being rebuilt to fix a production rendering
        bug. Other tabs work — Donate, Projects, Impact, Profile.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
    ...(Platform.OS === 'web' ? { height: '100vh' } : null),
  },
  content: { padding: 24, paddingTop: 80 },
  eyebrow: { fontSize: 12, fontWeight: '800', color: Colors.green, letterSpacing: 1, marginBottom: 6 },
  title:   { fontSize: 28, fontWeight: '700', color: Colors.green, marginBottom: 14 },
  body:    { fontSize: 15, color: Colors.gray, lineHeight: 22 },
});
