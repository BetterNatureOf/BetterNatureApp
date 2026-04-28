import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import { getOrgStats } from '../../services/orgStats';

const fmt = (n) => (!n ? '0' : n.toLocaleString('en-US'));

function buildProjects(stats) {
  return [
    {
      key: 'IRIS',
      name: 'IRIS',
      subtitle: 'Food Rescue Initiative',
      description:
        'Rescue surplus food from local restaurants and deliver it to communities in need. Every meal saved is a step toward zero food waste.',
      color: Colors.sage,
      lightColor: Colors.sageLight,
      emoji: '🍽️',
      stat: fmt(stats.meals),
      statLabel: 'meals rescued',
    },
    {
      key: 'Evergreen',
      name: 'Evergreen',
      subtitle: 'Conservation & Reforestation',
      description:
        'Native tree planting, urban canopy restoration, and pollinator corridors — led by chapter volunteers.',
      color: Colors.green,
      lightColor: Colors.greenLight,
      emoji: '🌲',
      stat: 'Launching',
      statLabel: 'first planting day',
    },
    {
      key: 'Hydro',
      name: 'Hydro',
      subtitle: 'Waterway Protection',
      description:
        'River, creek, and coastline cleanups. Microplastic surveys. Storm drain stenciling.',
      color: Colors.sky,
      lightColor: Colors.skyLight,
      emoji: '💧',
      stat: fmt(stats.water),
      statLabel: 'gallons saved',
    },
  ];
}

export default function ProjectsScreen({ navigation }) {
  const [stats, setStats] = useState({ meals: 0, water: 0 });
  useEffect(() => { getOrgStats().then(setStats).catch(() => {}); }, []);
  const PROJECTS = buildProjects(stats);
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <BrushText variant="screenTitle" style={styles.title}>
        Our Projects
      </BrushText>
      <Text style={styles.subtitle}>
        Three initiatives, one mission: a better world.
      </Text>

      {PROJECTS.map((project) => (
        <TouchableOpacity
          key={project.key}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('ProjectDetail', { project: project.key })}
          style={[styles.card, { borderLeftColor: project.color }]}
        >
          <View style={[styles.emojiCircle, { backgroundColor: project.lightColor }]}>
            <Text style={styles.emoji}>{project.emoji}</Text>
          </View>
          <Text style={styles.cardTitle}>{project.name}</Text>
          <Text style={styles.cardSubtitle}>{project.subtitle}</Text>
          <Text style={styles.cardDesc}>{project.description}</Text>
          <View style={styles.statRow}>
            <BrushText variant="statNumber" style={{ color: project.color }}>
              {project.stat}
            </BrushText>
            <Text style={styles.statLabel}>{project.statLabel}</Text>
          </View>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  content: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  title: { color: Colors.green },
  subtitle: { ...Type.body, color: Colors.gray, marginTop: 4, marginBottom: 24 },
  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: 24,
    marginBottom: 16,
    borderLeftWidth: 4,
    ...Shadows.card,
  },
  emojiCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emoji: { fontSize: 28 },
  cardTitle: { fontSize: 20, fontWeight: '800', color: Colors.dark },
  cardSubtitle: { fontSize: 13, color: Colors.gray, marginTop: 2 },
  cardDesc: { ...Type.body, color: Colors.gray, marginTop: 8, lineHeight: 22 },
  statRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 14, gap: 8 },
  statLabel: { ...Type.caption },
});
