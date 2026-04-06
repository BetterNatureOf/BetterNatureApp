import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Type, Spacing, Radius, Shadows } from '../../config/theme';
import BrushText from '../ui/BrushText';

const PROJECTS = [
  {
    key: 'IRIS',
    name: 'IRIS',
    subtitle: 'Food Rescue',
    description: 'Rescue surplus food from restaurants and deliver it to those in need.',
    color: Colors.sage,
    lightColor: Colors.sageLight,
  },
  {
    key: 'Evergreen',
    name: 'Evergreen',
    subtitle: 'Conservation',
    description: 'Protect wildlife and restore natural habitats in your community.',
    color: Colors.green,
    lightColor: Colors.greenLight,
  },
  {
    key: 'Hydro',
    name: 'Hydro',
    subtitle: 'Clean Water',
    description: 'Provide clean drinking water to communities around the world.',
    color: Colors.sky,
    lightColor: Colors.skyLight,
  },
];

export default function ProjectCards({ onPress }) {
  return (
    <View style={styles.container}>
      <BrushText variant="sectionHeader" style={styles.header}>
        Our Projects
      </BrushText>
      {PROJECTS.map((project) => (
        <TouchableOpacity
          key={project.key}
          activeOpacity={0.7}
          onPress={() => onPress(project.key)}
          style={[styles.card, { borderLeftColor: project.color }]}
        >
          <View style={[styles.iconDot, { backgroundColor: project.lightColor }]}>
            <Text style={[styles.iconText, { color: project.color }]}>
              {project.key === 'IRIS' ? '🍽️' : project.key === 'Evergreen' ? '🌲' : '💧'}
            </Text>
          </View>
          <View style={styles.textWrap}>
            <Text style={styles.projectName}>{project.name}</Text>
            <Text style={styles.subtitle}>{project.subtitle}</Text>
            <Text style={styles.desc} numberOfLines={2}>
              {project.description}
            </Text>
          </View>
          <Text style={styles.arrow}>›</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 24,
    marginTop: 24,
  },
  header: {
    color: Colors.green,
    marginBottom: 12,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 4,
    ...Shadows.card,
  },
  iconDot: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  iconText: {
    fontSize: 20,
  },
  textWrap: {
    flex: 1,
  },
  projectName: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.dark,
  },
  subtitle: {
    fontSize: 12,
    color: Colors.gray,
    marginBottom: 2,
  },
  desc: {
    ...Type.caption,
  },
  arrow: {
    fontSize: 24,
    color: Colors.grayMid,
    marginLeft: 8,
  },
});
