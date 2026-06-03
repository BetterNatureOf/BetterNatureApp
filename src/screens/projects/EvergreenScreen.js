import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import Card from '../../components/ui/Card';
import StatCard from '../../components/ui/StatCard';
import EventCard from '../../components/ui/EventCard';
import BrushDivider from '../../components/ui/BrushDivider';
import useEvents from '../../hooks/useEvents';
import Icon from '../../components/ui/Icon';
import ProjectLogo from '../../components/ui/ProjectLogo';

// Habitat categories — replaced cartoon emoji with the project's Lucide
// vocabulary (tree, leaf, droplet). Counts come from real data later;
// nothing is hard-coded so the page reads honest before launch.
const ANIMAL_CATEGORIES = [
  { key: 'forest',   name: 'Forest habitat',     icon: 'tree' },
  { key: 'wetland',  name: 'Wetland & water',    icon: 'droplet' },
  { key: 'pollinator', name: 'Pollinator garden', icon: 'leaf' },
  { key: 'urban',    name: 'Urban canopy',       icon: 'recycle' },
];

export default function EvergreenScreen({ navigation }) {
  const { events } = useEvents();
  const evergreenEvents = events.filter((e) => e.project === 'Evergreen');

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
        <View style={{ alignItems: 'center', marginTop: 6, marginBottom: 8 }}>
          <ProjectLogo project="evergreen" size={108} />
        </View>
        <BrushText variant="screenTitle" style={[styles.title, { textAlign: 'center', color: Colors.green }]}>
          Evergreen
        </BrushText>
        <Text style={[styles.subtitle, { textAlign: 'center' }]}>Wildlife & Conservation</Text>
        <Text style={styles.desc}>
          Protect endangered species and restore natural habitats. From tree
          planting to animal rescue, every action counts.
        </Text>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <StatCard number="0" label="Animals Helped" color={Colors.green} style={styles.stat} />
        <StatCard number="0" label="Trees Planted" color={Colors.green} style={styles.stat} />
        <StatCard number="0" label="Habitats" color={Colors.green} style={styles.stat} />
      </View>

      <BrushDivider color={Colors.green} />

      {/* Animal Gallery */}
      <BrushText variant="sectionHeader" style={styles.sectionTitle}>
        Habitats we restore
      </BrushText>

      <View style={styles.animalGrid}>
        {ANIMAL_CATEGORIES.map((animal) => (
          <TouchableOpacity
            key={animal.key}
            activeOpacity={0.7}
            onPress={() =>
              navigation.navigate('AnimalGallery', { species: animal.key, name: animal.name })
            }
            style={styles.animalCard}
          >
            <View style={styles.animalIconWrap}>
              <Icon name={animal.icon} size={22} color={Colors.green} strokeWidth={2} />
            </View>
            <Text style={styles.animalName}>{animal.name}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <BrushDivider color={Colors.green} />

      {/* Evergreen Events */}
      <BrushText variant="sectionHeader" style={styles.sectionTitle}>
        Evergreen Events
      </BrushText>

      {evergreenEvents.length === 0 ? (
        <Card style={styles.emptyCard}>
          <Text style={styles.emptyEmoji}>🌲</Text>
          <Text style={styles.emptyText}>No upcoming Evergreen events</Text>
        </Card>
      ) : (
        evergreenEvents.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            onPress={() => navigation.navigate('EventDetail', { event })}
          />
        ))
      )}

      <BrushDivider color={Colors.green} />

      {/* Photo Gallery placeholder */}
      <BrushText variant="sectionHeader" style={styles.sectionTitle}>
        Photo Gallery
      </BrushText>
      <Card style={styles.emptyCard}>
        <Text style={styles.emptyEmoji}>📷</Text>
        <Text style={styles.emptyText}>Photos coming soon</Text>
        <Text style={styles.emptySubtext}>
          Event photos will appear here after your chapter uploads them.
        </Text>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
    ...(Platform.OS === 'web' ? { height: '100vh' } : null),
  },
  content: { paddingBottom: 40 },
  header: { padding: 24, paddingTop: 60, backgroundColor: Colors.greenLight },
  back: { fontSize: 16, color: Colors.green, marginBottom: 8 },
  title: { color: Colors.green, fontSize: 36 },
  subtitle: { fontSize: 14, color: Colors.gray, marginTop: 2 },
  desc: { ...Type.body, color: Colors.gray, marginTop: 8, lineHeight: 22 },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    marginTop: 20,
    gap: 10,
  },
  stat: { flex: 1 },
  sectionTitle: { color: Colors.green, paddingHorizontal: 24, marginBottom: 12 },
  animalGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 24,
    gap: 12,
  },
  animalCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: 16,
    alignItems: 'center',
    width: '47%',
    ...Shadows.card,
  },
  animalIconWrap: {
    width: 48, height: 48, borderRadius: 12,
    backgroundColor: Colors.greenLight,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 10,
  },
  animalName: { fontSize: 15, fontWeight: '700', color: Colors.dark },
  animalCount: { ...Type.caption, marginTop: 2 },
  emptyCard: { marginHorizontal: 24, alignItems: 'center', padding: 32 },
  emptyEmoji: { fontSize: 40, marginBottom: 8 },
  emptyText: { fontSize: 15, fontWeight: '500', color: Colors.dark },
  emptySubtext: { ...Type.caption, marginTop: 4, textAlign: 'center' },
});
