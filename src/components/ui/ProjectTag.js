import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../../config/theme';

/**
 * ProjectTag — small colored pill: IRIS / Evergreen / Hydro.
 */
export default function ProjectTag({ project, style }) {
  const projectColors = Colors.project[project] || Colors.project.IRIS;

  return (
    <View style={[styles.tag, { backgroundColor: projectColors.light }, style]}>
      <Text style={[styles.text, { color: projectColors.primary }]}>
        {project}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
  },
});
