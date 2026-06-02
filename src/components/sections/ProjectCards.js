// Project cards — IRIS / EVERGREEN / HYDRO.
//
// Each card pairs the real project logo (left) with the program copy
// and a colored chevron. The logo is rendered via <ProjectLogo /> which
// silently falls back to a tinted initial circle if the bundled image
// isn't in place yet — drop the PNG into src/assets/projects/ and the
// real logo appears on next reload.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from '../ui/BrushText';
import ProjectLogo from '../ui/ProjectLogo';
import AnimatedPressable from '../ui/AnimatedPressable';
import Icon from '../ui/Icon';

const PROJECTS = [
  {
    key: 'IRIS',
    logo: 'iris',
    name: 'IRIS',
    subtitle: 'Food rescue',
    description: 'Rescue surplus from restaurants. Deliver to fridges and families.',
    color: Colors.pink,
    bg: '#FFE5EE',
  },
  {
    key: 'Evergreen',
    logo: 'evergreen',
    name: 'Evergreen',
    subtitle: 'Conservation',
    description: 'Plant native trees, restore habitats, protect what’s left.',
    color: Colors.green,
    bg: '#DFF1E2',
  },
  {
    key: 'Hydro',
    logo: 'hydro',
    name: 'Hydro',
    subtitle: 'Water access',
    description: 'Cleanups, water testing, clean drinking water everywhere.',
    color: Colors.sky,
    bg: '#E1EDFA',
  },
];

export default function ProjectCards({ onPress }) {
  return (
    <View style={styles.container}>
      <BrushText variant="sectionHeader" style={styles.header}>
        Our programs
      </BrushText>
      {PROJECTS.map((p) => (
        <AnimatedPressable
          key={p.key}
          onPress={() => onPress(p.key)}
          style={styles.card}
          scaleTo={0.985}
        >
          {/* The logo component renders its own halo frame now — no
              outer bubble. Sized larger so the logo dominates the row. */}
          <ProjectLogo project={p.logo} size={84} />
          <View style={styles.textWrap}>
            <View style={styles.nameRow}>
              <Text style={[styles.projectName, { color: p.color }]}>{p.name}</Text>
              <View style={[styles.accentLine, { backgroundColor: p.color }]} />
            </View>
            <Text style={styles.subtitle}>{p.subtitle}</Text>
            <Text style={styles.desc} numberOfLines={2}>{p.description}</Text>
          </View>
          <View style={[styles.arrowCircle, { backgroundColor: p.bg }]}>
            <Icon name="chevron" size={18} color={p.color} />
          </View>
        </AnimatedPressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 24, marginTop: 24 },
  header: { color: Colors.green, marginBottom: 14 },
  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: 14,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    ...Shadows.card,
  },
  textWrap: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  projectName: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  accentLine: { height: 2, width: 20, borderRadius: 1 },
  subtitle: { fontSize: 12, color: Colors.grayMid, marginTop: 1, marginBottom: 4, fontWeight: '600', letterSpacing: 0.2, textTransform: 'uppercase' },
  desc: { ...Type.caption, fontSize: 13 },
  arrowCircle: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
});
