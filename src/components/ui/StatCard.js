import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from './BrushText';
import AnimatedNumber from './AnimatedNumber';

/**
 * StatCard — tinted glass card with a large brush number + label.
 * If `number` is a plain integer the value counts up on mount; strings
 * (like "5.0" or "120h") render as-is so we don't fight with formatting.
 */
export default function StatCard({ number, label, color = Colors.green, style }) {
  const tintBg = color + '0D';
  const numeric = typeof number === 'number' || /^-?\d+$/.test(String(number));
  const suffixMatch = String(number).match(/[^\d-]+$/);
  const target = numeric ? Number(number) : parseInt(String(number), 10);

  return (
    <View style={[styles.card, { backgroundColor: tintBg }, style]}>
      <View style={[styles.dot, { backgroundColor: color + '18' }]}>
        <View style={[styles.innerDot, { backgroundColor: color }]} />
      </View>
      {numeric || !isNaN(target) ? (
        <AnimatedNumber
          value={target || 0}
          suffix={suffixMatch ? suffixMatch[0] : ''}
          style={[styles.numText, { color }]}
        />
      ) : (
        <BrushText variant="statNumber" style={{ color }}>{number}</BrushText>
      )}
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
  numText: { fontSize: 30, fontWeight: '800', letterSpacing: -0.5 },
  label: {
    ...Type.caption,
    marginTop: 4,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '500',
  },
});
