import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Colors, Shadows, Radius } from '../../config/theme';

/**
 * Card — frosted glass card with subtle depth.
 * accentColor: optional left border color (for project cards).
 * variant: 'default' | 'elevated' | 'outlined'
 */
export default function Card({ children, accentColor, variant = 'default', style }) {
  return (
    <View
      style={[
        styles.card,
        variant === 'elevated' && styles.elevated,
        variant === 'outlined' && styles.outlined,
        accentColor && { borderLeftWidth: 3, borderLeftColor: accentColor },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    ...Shadows.card,
  },
  elevated: {
    ...Shadows.cardHover,
  },
  outlined: {
    backgroundColor: 'transparent',
    borderColor: Colors.grayLight,
    shadowOpacity: 0,
    elevation: 0,
  },
});
