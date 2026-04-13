import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Radius } from '../../config/theme';

/**
 * ProjectTag — refined pill: IRIS / Evergreen / Hydro.
 */
export default function ProjectTag({ project, style }) {
  const projectColors = Colors.project[project] || Colors.project.IRIS;

  return (
    <View style={[styles.tag, { backgroundColor: projectColors.light }, style]}>
      <View style={[styles.dot, { backgroundColor: projectColors.primary }]} />
      <Text style={[styles.text, { color: projectColors.primary }]}>
        {project}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    alignSelf: 'flex-start',
    gap: 5,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});
