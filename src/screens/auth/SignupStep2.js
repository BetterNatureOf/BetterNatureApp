import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import Button from '../../components/ui/Button';
import { fetchChapters } from '../../services/database';

export default function SignupStep2({ navigation, route }) {
  const userData = route.params;
  const [chapters, setChapters] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadChapters();
  }, []);

  async function loadChapters() {
    try {
      const data = await fetchChapters();
      setChapters(data);

      // Auto-recommend based on city
      if (userData.city) {
        const match = data.find(
          (c) => c.city?.toLowerCase() === userData.city.toLowerCase()
        );
        if (match) setSelected(match.id);
      }
    } catch (e) {
      console.error('Failed to load chapters:', e);
    } finally {
      setLoading(false);
    }
  }

  function handleNext() {
    navigation.navigate('SignupStep3', {
      ...userData,
      chapter_id: selected,
    });
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <BrushText variant="screenTitle" style={styles.title}>
        Choose Your Chapter
      </BrushText>
      <Text style={styles.subtitle}>
        Chapters are local groups that organize events in your area.
      </Text>

      {loading ? (
        <ActivityIndicator size="large" color={Colors.pink} style={styles.loader} />
      ) : chapters.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No chapters available yet</Text>
          <Text style={styles.emptySubtext}>
            You can join one later or start your own!
          </Text>
        </View>
      ) : (
        chapters.map((chapter) => (
          <TouchableOpacity
            key={chapter.id}
            activeOpacity={0.7}
            onPress={() => setSelected(chapter.id)}
            style={[
              styles.chapterCard,
              selected === chapter.id && styles.chapterSelected,
            ]}
          >
            <View style={styles.chapterInfo}>
              <Text style={styles.chapterName}>{chapter.name}</Text>
              <Text style={styles.chapterLocation}>
                {chapter.city}, {chapter.state}
              </Text>
              <Text style={styles.chapterMembers}>
                {chapter.member_count || 0} members
              </Text>
            </View>
            <View
              style={[
                styles.radio,
                selected === chapter.id && styles.radioSelected,
              ]}
            >
              {selected === chapter.id && <View style={styles.radioDot} />}
            </View>
          </TouchableOpacity>
        ))
      )}

      <Button title="Next" onPress={handleNext} style={styles.btn} />

      <TouchableOpacity
        onPress={() => navigation.navigate('StartChapter', userData)}
        style={styles.startLink}
      >
        <Text style={styles.startText}>
          Don't see your area? <Text style={styles.startBold}>Start a chapter</Text>
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  content: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  title: { color: Colors.green },
  subtitle: { ...Type.body, color: Colors.gray, marginTop: 4, marginBottom: 24 },
  loader: { marginTop: 40 },
  emptyCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: 32,
    alignItems: 'center',
    ...Shadows.card,
  },
  emptyText: { fontSize: 15, fontWeight: '500', color: Colors.dark },
  emptySubtext: { ...Type.caption, marginTop: 4 },
  chapterCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
    ...Shadows.card,
  },
  chapterSelected: {
    borderColor: Colors.pink,
  },
  chapterInfo: { flex: 1 },
  chapterName: { fontSize: 16, fontWeight: '700', color: Colors.dark },
  chapterLocation: { ...Type.caption, marginTop: 2 },
  chapterMembers: { fontSize: 12, color: Colors.sage, marginTop: 2 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.grayLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { borderColor: Colors.pink },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.pink,
  },
  btn: { marginTop: 24 },
  startLink: { marginTop: 16, alignItems: 'center' },
  startText: { ...Type.caption },
  startBold: { color: Colors.pink, fontWeight: '600' },
});
