import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
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
    icon: '\u{1F37D}',
  },
  {
    key: 'Evergreen',
    name: 'Evergreen',
    subtitle: 'Conservation',
    description: 'Protect wildlife and restore natural habitats in your community.',
    color: Colors.green,
    lightColor: Colors.greenLight,
    icon: '\u{1F332}',
  },
  {
    key: 'Hydro',
    name: 'Hydro',
    subtitle: 'Clean Water',
    description: 'Provide clean drinking water to communities around the world.',
    color: Colors.sky,
    lightColor: Colors.skyLight,
    icon: '\u{1F4A7}',
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
          activeOpacity={0.75}
          onPress={() => onPress(project.key)}
          style={styles.card}
        >
          <View style={[styles.iconWrap, { backgroundColor: project.lightColor }]}>
            <Text style={styles.iconText}>{project.icon}</Text>
          </View>
          <View style={styles.textWrap}>
            <View style={styles.nameRow}>
              <Text style={styles.projectName}>{project.name}</Text>
              <View style={[styles.accentLine, { backgroundColor: project.color }]} />
            </View>
            <Text style={styles.subtitle}>{project.subtitle}</Text>
            <Text style={styles.desc} numberOfLines={2}>
              {project.description}
            </Text>
          </View>
          <View style={[styles.arrowCircle, { backgroundColor: project.lightColor }]}>
            <Text style={[styles.arrow, { color: project.color }]}>{'\u203A'}</Text>
          </View>
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
    marginBottom: 14,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    ...Shadows.card,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  iconText: {
    fontSize: 22,
  },
  textWrap: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  projectName: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.dark,
    letterSpacing: -0.2,
  },
  accentLine: {
    height: 2,
    width: 16,
    borderRadius: 1,
  },
  subtitle: {
    fontSize: 12,
    color: Colors.grayMid,
    marginTop: 1,
    marginBottom: 3,
    fontWeight: '500',
  },
  desc: {
    ...Type.caption,
    fontSize: 13,
  },
  arrowCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  arrow: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: -1,
  },
});
