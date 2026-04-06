import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import { fetchAnimalsHelped } from '../../services/database';

export default function AnimalGallery({ navigation, route }) {
  const { species, name } = route.params;
  const [animals, setAnimals] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAnimals();
  }, []);

  async function loadAnimals() {
    try {
      const data = await fetchAnimalsHelped();
      const filtered = data.filter(
        (a) => a.species.toLowerCase() === species.toLowerCase()
      );
      setAnimals(filtered);
    } catch (e) {
      console.error('Failed to load animals:', e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Text style={styles.back}>‹ Back to Evergreen</Text>
      </TouchableOpacity>

      <BrushText variant="screenTitle" style={styles.title}>
        {name}
      </BrushText>
      <Text style={styles.subtitle}>
        Photos from our conservation efforts
      </Text>

      {animals.length === 0 && !loading ? (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>📷</Text>
          <Text style={styles.emptyText}>No photos yet for {name}</Text>
          <Text style={styles.emptySubtext}>
            Photos will appear here as chapters upload them from events.
          </Text>
        </View>
      ) : (
        <View style={styles.grid}>
          {animals.map((animal) =>
            (animal.photos || []).map((photoUrl, i) => (
              <View key={`${animal.id}-${i}`} style={styles.photoCard}>
                <Image source={{ uri: photoUrl }} style={styles.photo} />
              </View>
            ))
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  content: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  back: { fontSize: 16, color: Colors.green, marginBottom: 8 },
  title: { color: Colors.green },
  subtitle: { ...Type.body, color: Colors.gray, marginTop: 4, marginBottom: 24 },
  empty: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: 40,
    alignItems: 'center',
    ...Shadows.card,
  },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 15, fontWeight: '500', color: Colors.dark },
  emptySubtext: { ...Type.caption, marginTop: 4, textAlign: 'center' },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  photoCard: {
    width: '48.5%',
    aspectRatio: 1,
    borderRadius: Radius.md,
    overflow: 'hidden',
    ...Shadows.card,
  },
  photo: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
});
