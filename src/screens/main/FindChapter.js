// Chapter discovery — lets a member browse every active chapter and
// (a) request to join one or (b) switch chapters when they move.
// Pulls the same chapters collection the website "Find your chapter"
// section reads, so what shows here matches what's public.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import Button from '../../components/ui/Button';
import ResponsiveContainer from '../../components/ui/ResponsiveContainer';
import Screen from '../../components/ui/Screen';
import { fetchChapters } from '../../services/database';
import { updateProfile } from '../../services/auth';
import useAuthStore from '../../store/authStore';
import { notify, confirm } from '../../services/ui';

export default function FindChapter({ navigation }) {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [chapters, setChapters] = useState([]);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(null);

  const load = useCallback(async () => {
    try {
      const list = await fetchChapters();
      setChapters(list);
    } catch {}
  }, []);
  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return chapters;
    return chapters.filter((c) =>
      [c.name, c.city, c.state, c.country].some((v) => (v || '').toLowerCase().includes(q))
    );
  }, [chapters, search]);

  async function join(chapter) {
    if (user?.chapter_id === chapter.id) {
      notify('Already in this chapter', `You're already on the ${chapter.name} roster.`);
      return;
    }
    const switching = !!user?.chapter_id;
    const ok = await confirm(
      switching ? 'Switch chapter?' : 'Join chapter?',
      switching
        ? `Move from your current chapter to ${chapter.name}? Your history stays with you.`
        : `Add yourself to the ${chapter.name} roster?`
    );
    if (!ok) return;
    setSaving(chapter.id);
    try {
      await updateProfile(user.id, { chapter_id: chapter.id });
      if (setUser) setUser({ ...user, chapter_id: chapter.id, chapter: { id: chapter.id, name: chapter.name } });
      notify('Done', `You're on the ${chapter.name} roster.`);
    } catch (e) {
      notify('Could not join', e?.message || 'Try again.');
    } finally { setSaving(null); }
  }

  return (
    <Screen contentStyle={styles.content}>
      <ResponsiveContainer maxWidth={780}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
        <BrushText variant="screenTitle" style={styles.title}>Find your chapter</BrushText>
        <Text style={styles.subtitle}>
          Moved cities or never picked a chapter at signup? Browse and join.
        </Text>

        <TextInput
          style={styles.search}
          placeholder="Search by city, region, or country"
          placeholderTextColor={Colors.grayMid}
          value={search}
          onChangeText={setSearch}
        />

        {filtered.length === 0 ? (
          <Text style={styles.empty}>No matches. Try a broader search.</Text>
        ) : (
          filtered.map((c) => {
            const isMine = user?.chapter_id === c.id;
            return (
              <View key={c.id} style={styles.card}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{c.name}</Text>
                  <Text style={styles.loc}>{[c.city, c.state, c.country].filter(Boolean).join(', ')}</Text>
                  {c.president_name ? <Text style={styles.pres}>President: {c.president_name}</Text> : null}
                  {c.description ? <Text style={styles.desc}>{c.description}</Text> : null}
                </View>
                {isMine ? (
                  <View style={styles.mineBadge}><Text style={styles.mineBadgeText}>Your chapter</Text></View>
                ) : (
                  <Button
                    title={user?.chapter_id ? 'Switch' : 'Join'}
                    onPress={() => join(c)}
                    loading={saving === c.id}
                    style={{ minWidth: 110 }}
                  />
                )}
              </View>
            );
          })
        )}

        <View style={styles.cta}>
          <Text style={styles.ctaTitle}>Don't see your city?</Text>
          <Text style={styles.ctaBody}>Start a chapter — we'll send you the playbook.</Text>
          <Button title="Start a chapter" variant="secondary" onPress={() => navigation.navigate('StartChapter')} style={{ marginTop: 12 }} />
        </View>
      </ResponsiveContainer>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream, ...(Platform.OS === 'web' ? { height: '100vh' } : null) },
  content: { padding: 24, paddingTop: 60, paddingBottom: 60 },
  back: { fontSize: 16, color: Colors.green, marginBottom: 8 },
  title: { color: Colors.green, marginBottom: 6 },
  subtitle: { ...Type.body, color: Colors.gray, marginBottom: 16 },
  search: {
    backgroundColor: Colors.white, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: Colors.dark, borderWidth: 1, borderColor: Colors.glassBorder, marginBottom: 14,
  },
  empty: { ...Type.body, color: Colors.gray, textAlign: 'center', paddingVertical: 24 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.white, borderRadius: Radius.xl, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: Colors.glassBorder, ...Shadows.card,
  },
  name: { fontSize: 16, fontWeight: '800', color: Colors.dark },
  loc: { ...Type.caption, marginTop: 2 },
  pres: { ...Type.caption, marginTop: 4, color: Colors.green, fontWeight: '700' },
  desc: { ...Type.caption, marginTop: 6, color: Colors.grayMid },
  mineBadge: { backgroundColor: '#E8F5EE', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999 },
  mineBadgeText: { fontSize: 11, fontWeight: '800', color: Colors.green, textTransform: 'uppercase', letterSpacing: 0.6 },
  cta: {
    marginTop: 22, padding: 18, backgroundColor: Colors.white,
    borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.glassBorder,
  },
  ctaTitle: { fontSize: 16, fontWeight: '800', color: Colors.green },
  ctaBody: { ...Type.body, color: Colors.gray, marginTop: 4 },
});
