import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from './BrushText';

/**
 * StatCard — displays an impact stat with a large brush number + label.
 * color: optional tint for the number.
 */
export default function StatCard({ number, label, color = Colors.green, style }) {
  return (
    <View style={[styles.card, style]}>
      <BrushText variant="statNumber" style={{ color }}>
        {number}
      </BrushText>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: 16,
    alignItems: 'center',
    minWidth: 100,
    ...Shadows.card,
  },
  label: {
    ...Type.caption,
    marginTop: 4,
    textAlign: 'center',
  },
});
