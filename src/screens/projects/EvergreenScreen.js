import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import Card from '../../components/ui/Card';
import StatCard from '../../components/ui/StatCard';
import EventCard from '../../components/ui/EventCard';
import BrushDivider from '../../components/ui/BrushDivider';
import useEvents from '../../hooks/useEvents';

const ANIMAL_CATEGORIES = [
  { key: 'deer', name: 'Deer', emoji: '🦌', count: 42 },
  { key: 'birds', name: 'Birds', emoji: '🐦', count: 65 },
  { key: 'turtles', name: 'Turtles', emoji: '🐢', count: 18 },
  { key: 'rabbits', name: 'Rabbits', emoji: '🐇', count: 27 },
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
        <BrushText variant="screenTitle" style={styles.title}>
          Evergreen
        </BrushText>
        <Text style={styles.subtitle}>Wildlife & Conservation</Text>
        <Text style={styles.desc}>
          Protect endangered species and restore natural habitats. From tree
          planting to animal rescue, every action counts.
        </Text>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <StatCard number="150+" label="Animals Helped" color={Colors.green} style={styles.stat} />
        <StatCard number="500" label="Trees Planted" color={Colors.green} style={styles.stat} />
        <StatCard number="12" label="Habitats" color={Colors.green} style={styles.stat} />
      </View>

      <BrushDivider color={Colors.green} />

      {/* Animal Gallery */}
      <BrushText variant="sectionHeader" style={styles.sectionTitle}>
        Animals We've Helped
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
            <Text style={styles.animalEmoji}>{animal.emoji}</Text>
            <Text style={styles.animalName}>{animal.name}</Text>
            <Text style={styles.animalCount}>{animal.count} helped</Text>
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
  container: { flex: 1, backgroundColor: Colors.cream },
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
  animalEmoji: { fontSize: 40, marginBottom: 8 },
  animalName: { fontSize: 15, fontWeight: '700', color: Colors.dark },
  animalCount: { ...Type.caption, marginTop: 2 },
  emptyCard: { marginHorizontal: 24, alignItems: 'center', padding: 32 },
  emptyEmoji: { fontSize: 40, marginBottom: 8 },
  emptyText: { fontSize: 15, fontWeight: '500', color: Colors.dark },
  emptySubtext: { ...Type.caption, marginTop: 4, textAlign: 'center' },
});
