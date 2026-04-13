import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Colors } from '../../config/theme';

/**
 * BrushDivider — clean gradient fade divider.
 */
export default function BrushDivider({ color = Colors.grayLight, style }) {
  return (
    <View style={[styles.container, style]}>
      <View style={[styles.line, { backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 20,
    paddingHorizontal: 40,
    alignItems: 'center',
  },
  line: {
    height: 1,
    width: '100%',
    opacity: 0.6,
    borderRadius: 1,
  },
});
