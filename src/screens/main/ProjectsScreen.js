import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import ResponsiveContainer from '../../components/ui/ResponsiveContainer';
import useBreakpoint from '../../hooks/useBreakpoint';
import { getOrgStats } from '../../services/orgStats';
import ProjectLogo from '../../components/ui/ProjectLogo';
import Screen from '../../components/ui/Screen';

const fmt = (n) => (!n ? '0' : n.toLocaleString('en-US'));

function buildProjects(stats) {
  return [
    {
      key: 'IRIS',
      logo: 'iris',
      name: 'IRIS',
      subtitle: 'Food Rescue Initiative',
      description:
        'Rescue surplus food from local restaurants and deliver it to communities in need. Every meal saved is a step toward zero food waste.',
      color: Colors.pink,
      stat: fmt(stats.lbs || Math.round((stats.meals || 0) / 1.2)),
      statLabel: 'lbs of food rescued',
    },
    {
      key: 'Evergreen',
      logo: 'evergreen',
      name: 'Evergreen',
      subtitle: 'Conservation & Reforestation',
      description:
        'Native tree planting, urban canopy restoration, and pollinator corridors — led by chapter volunteers.',
      color: Colors.green,
      stat: 'Launching',
      statLabel: 'first planting day',
    },
    {
      key: 'Hydro',
      logo: 'hydro',
      name: 'Hydro',
      subtitle: 'Waterway Protection',
      description:
        'River, creek, and coastline cleanups. Microplastic surveys. Storm drain stenciling.',
      color: Colors.sky,
      stat: fmt(stats.water),
      statLabel: 'gallons saved',
    },
  ];
}

export default function ProjectsScreen({ navigation }) {
  const [stats, setStats] = useState({ meals: 0, water: 0 });
  useEffect(() => { getOrgStats().then(setStats).catch(() => {}); }, []);
  const PROJECTS = buildProjects(stats);
  const { isDesktop, isTablet } = useBreakpoint();

  // Desktop: 3-up grid. Tablet: 2-up. Phone: stack.
  const cardStyle = [
    styles.card,
    isDesktop && styles.cardDesktop,
    isTablet && styles.cardTablet,
  ];

  return (
    <Screen contentStyle={styles.content}>
      <ResponsiveContainer maxWidth={1200}>
        <BrushText variant="screenTitle" style={styles.title}>
          Our Projects
        </BrushText>
        <Text style={styles.subtitle}>
          Three initiatives, one mission: a better world.
        </Text>

        <View style={[styles.grid, (isDesktop || isTablet) && styles.gridWide]}>
          {PROJECTS.map((project) => (
            <TouchableOpacity
              key={project.key}
              activeOpacity={0.85}
              onPress={() => navigation.navigate('ProjectDetail', { project: project.key })}
              style={[...cardStyle, { borderLeftColor: project.color }]}
            >
              <ProjectLogo project={project.logo} size={92} style={{ marginBottom: 14 }} />
              <Text style={[styles.cardTitle, { color: project.color }]}>{project.name}</Text>
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
        </View>
      </ResponsiveContainer>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
    ...(Platform.OS === 'web' ? { height: '100vh' } : null),
  },
  content: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  title: { color: Colors.green },
  subtitle: { ...Type.body, color: Colors.gray, marginTop: 4, marginBottom: 24 },
  grid: { flexDirection: 'column', gap: 16 },
  gridWide: { flexDirection: 'row', flexWrap: 'wrap', gap: 20 },
  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: 24,
    marginBottom: 16,
    borderLeftWidth: 4,
    ...Shadows.card,
  },
  // RN Web doesn't support calc() in style sheets, so we approximate with
  // a percentage basis and let flex-wrap pack the cards. The trailing
  // marginBottom: 0 lets `gap` on the grid handle the rhythm instead.
  cardTablet: { flexGrow: 1, flexBasis: '46%', maxWidth: '49%', marginBottom: 0 },
  cardDesktop: { flexGrow: 1, flexBasis: '30%', maxWidth: '32%', marginBottom: 0 },
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
