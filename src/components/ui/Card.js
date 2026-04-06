import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Colors, Shadows, Radius } from '../../config/theme';

/**
 * Card — white rounded card with subtle shadow.
 * accentColor: optional left border color (for project cards).
 */
export default function Card({ children, accentColor, style }) {
  return (
    <View
      style={[
        styles.card,
        accentColor && { borderLeftWidth: 4, borderLeftColor: accentColor },
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
    ...Shadows.card,
  },
});
