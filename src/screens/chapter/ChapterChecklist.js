import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import useAuthStore from '../../store/authStore';
import { fetchChecklistProgress, updateChecklistItem } from '../../services/database';

const CHECKLIST_ITEMS = [
  { key: 'team', label: 'Recruit founding team (3+ members)', description: 'Find at least 3 dedicated members' },
  { key: 'slack', label: 'Set up Slack channel', description: 'Create your chapter\'s Slack workspace' },
  { key: 'meeting', label: 'Host first team meeting', description: 'Align on goals and assign roles' },
  { key: 'restaurants', label: 'Connect with 3 restaurants', description: 'Find local restaurant partners for IRIS' },
  { key: 'event_iris', label: 'Organize first IRIS pickup', description: 'Complete your first food rescue' },
  { key: 'event_evergreen', label: 'Organize first Evergreen event', description: 'Host a conservation activity' },
  { key: 'social', label: 'Set up social media', description: 'Create Instagram/social for your chapter' },
  { key: 'photos', label: 'Upload first event photos', description: 'Document your impact' },
  { key: 'recruit', label: 'Reach 10 members', description: 'Grow your chapter to 10 volunteers' },
  { key: 'donation', label: 'Set up donation page', description: 'Enable donations through Zeffy' },
];

export default function ChapterChecklist({ navigation }) {
  const user = useAuthStore((s) => s.user);
  const [progress, setProgress] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProgress();
  }, []);

  async function loadProgress() {
    if (!user?.chapter_id) {
      setLoading(false);
      return;
    }
    try {
      const data = await fetchChecklistProgress(user.chapter_id);
      const map = {};
      data.forEach((item) => {
        map[item.item_key] = item.status;
      });
      setProgress(map);
    } catch (e) {
      console.error('Failed to load checklist:', e);
    } finally {
      setLoading(false);
    }
  }

  async function toggleItem(key) {
    if (!user?.chapter_id) return;
    const current = progress[key] || 'incomplete';
    const next = current === 'complete' ? 'incomplete' : 'complete';
    setProgress((prev) => ({ ...prev, [key]: next }));
    try {
      await updateChecklistItem(user.chapter_id, key, next);
    } catch {}
  }

  const completed = Object.values(progress).filter((s) => s === 'complete').length;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Text style={styles.back}>‹ Back</Text>
      </TouchableOpacity>

      <BrushText variant="screenTitle" style={styles.title}>
        Chapter Checklist
      </BrushText>
      <Text style={styles.subtitle}>
        {completed} of {CHECKLIST_ITEMS.length} complete
      </Text>

      {/* Progress Bar */}
      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            { width: `${(completed / CHECKLIST_ITEMS.length) * 100}%` },
          ]}
        />
      </View>

      {/* Items */}
      {CHECKLIST_ITEMS.map((item) => {
        const status = progress[item.key] || 'incomplete';
        return (
          <TouchableOpacity
            key={item.key}
            style={styles.itemCard}
            onPress={() => toggleItem(item.key)}
            activeOpacity={0.7}
          >
            <View
              style={[
                styles.checkbox,
                status === 'complete' && styles.checkboxDone,
              ]}
            >
              {status === 'complete' && <Text style={styles.check}>✓</Text>}
            </View>
            <View style={styles.itemText}>
              <Text
                style={[
                  styles.itemLabel,
                  status === 'complete' && styles.itemLabelDone,
                ]}
              >
                {item.label}
              </Text>
              <Text style={styles.itemDesc}>{item.description}</Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  content: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  back: { fontSize: 16, color: Colors.green, marginBottom: 8 },
  title: { color: Colors.green },
  subtitle: { ...Type.body, color: Colors.gray, marginTop: 4, marginBottom: 16 },
  progressTrack: {
    height: 8,
    backgroundColor: Colors.grayLight,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 24,
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.green,
    borderRadius: 4,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: 16,
    marginBottom: 10,
    ...Shadows.card,
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: Colors.grayLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  checkboxDone: {
    backgroundColor: Colors.green,
    borderColor: Colors.green,
  },
  check: { color: Colors.white, fontSize: 14, fontWeight: '700' },
  itemText: { flex: 1 },
  itemLabel: { fontSize: 15, fontWeight: '600', color: Colors.dark },
  itemLabelDone: { textDecorationLine: 'line-through', color: Colors.gray },
  itemDesc: { ...Type.caption, marginTop: 2 },
});
