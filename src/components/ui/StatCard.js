import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from './BrushText';

/**
 * StatCard — tinted glass card with a large brush number + label.
 * color: tint for the number and background.
 */
export default function StatCard({ number, label, color = Colors.green, style }) {
  // Derive a very soft tint from the accent color
  const tintBg = color + '0D'; // ~5% opacity hex

  return (
    <View style={[styles.card, { backgroundColor: tintBg }, style]}>
      <View style={[styles.dot, { backgroundColor: color + '18' }]}>
        <View style={[styles.innerDot, { backgroundColor: color }]} />
      </View>
      <BrushText variant="statNumber" style={{ color }}>
        {number}
      </BrushText>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    padding: 16,
    alignItems: 'center',
    minWidth: 100,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    ...Shadows.soft,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  innerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    ...Type.caption,
    marginTop: 4,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '500',
  },
});
