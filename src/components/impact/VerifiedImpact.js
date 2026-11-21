// Verified impact from the activity ledger (each activity counted once),
// with any difference from legacy profile counters explained rather than
// added. Used for one volunteer (memberId) or a chapter (chapterId).
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Colors } from '../../config/theme';
import Button from '../ui/Button';
import { fetchVolunteerImpact, fetchChapterImpact } from '../../services/database';

const FIELD = { lbs_rescued: 'pounds', meals_rescued: 'meals', hours_logged: 'hours', events_attended: 'activities',
  pickups_completed: 'deliveries' };
const fmt = (n) => (Number.isInteger(n) ? n.toLocaleString() : Number(n).toFixed(1));

export default function VerifiedImpact({ memberId, chapterId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setError(''); setData(null);
    try { setData(memberId ? await fetchVolunteerImpact(memberId) : await fetchChapterImpact(chapterId)); }
    catch (e) { setError(e?.message || 'Could not load verified impact.'); }
  }, [memberId, chapterId]);
  useEffect(() => { if (memberId || chapterId) load(); }, [load, memberId, chapterId]);

  const v = data && (data.verified || data.totals);
  return (
    <View style={styles.card} accessibilityRole="summary">
      <Text style={styles.title}>Verified impact</Text>
      <Text style={styles.help}>Counted once from deliveries, event check-ins and coordinator-recorded work. Voided entries are excluded.</Text>
      {!data && !error && <ActivityIndicator color={Colors.green} />}
      {!!error && (<><Text style={styles.error}>{error}</Text><Button title="Retry" variant="secondary" onPress={load} /></>)}
      {v && (
        <View style={styles.stats}>
          <Stat value={fmt(v.lbs)} label="lb rescued" />
          <Stat value={fmt(v.meals)} label="meals" />
          <Stat value={fmt(v.hours)} label="hours" />
          <Stat value={fmt(v.deliveries)} label="deliveries" />
          <Stat value={fmt(v.events)} label="events" />
        </View>
      )}
      {data?.breakdown && (
        <Text style={styles.meta}>
          Deliveries {fmt(data.breakdown.deliveries.hours)} h · Events {fmt(data.breakdown.events.hours)} h · Coordinator-recorded {fmt(data.breakdown.manual.hours)} h
          {data.audit.voided.length ? ` · ${data.audit.voided.length} voided` : ''}{data.audit.duplicates.length ? ` · ${data.audit.duplicates.length} duplicate${data.audit.duplicates.length === 1 ? '' : 's'} ignored` : ''}
        </Text>
      )}
      {data?.differences?.length > 0 && (
        <View style={styles.note}>
          <Text style={styles.noteTitle}>Profile counters don’t match the activity on record</Text>
          {data.differences.map((d) => (
            <Text key={d.field} style={styles.noteText}>
              {FIELD[d.field] || d.field}: profile {fmt(d.profile)}, on record {fmt(d.ledger)} ({d.difference > 0 ? '+' : ''}{fmt(d.difference)}). {d.explanation}
            </Text>
          ))}
        </View>
      )}
      {data?.flagged?.length > 0 && (
        <View style={styles.note}>
          <Text style={styles.noteTitle}>{data.flagged.length} member{data.flagged.length === 1 ? '' : 's'} with counters to review</Text>
          {data.flagged.slice(0, 8).map((m) => (
            <Text key={m.id} style={styles.noteText}>
              {m.name}: {m.differences.map((d) => `${FIELD[d.field] || d.field} ${d.difference > 0 ? '+' : ''}${fmt(d.difference)}`).join(', ')}
              {m.duplicates ? ` · ${m.duplicates} duplicate row${m.duplicates === 1 ? '' : 's'} ignored` : ''}
            </Text>
          ))}
          <Text style={styles.noteText}>Verified totals above don’t include these differences.</Text>
        </View>
      )}
    </View>
  );
}

function Stat({ value, label }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: Colors.white, borderRadius: 14, borderWidth: 1, borderColor: Colors.grayLight, padding: 14, marginVertical: 10, gap: 8 },
  title: { fontSize: 16, fontWeight: '700', color: Colors.dark },
  help: { fontSize: 13, color: Colors.gray, lineHeight: 18 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stat: { minWidth: 90, backgroundColor: Colors.greenLight, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12 },
  statValue: { fontSize: 18, fontWeight: '800', color: Colors.green },
  statLabel: { fontSize: 12, color: Colors.green, marginTop: 2 },
  meta: { fontSize: 13, color: Colors.gray, lineHeight: 18 },
  note: { backgroundColor: Colors.amberLight, borderRadius: 12, padding: 12, gap: 6 },
  noteTitle: { fontSize: 14, fontWeight: '700', color: '#7A4E0E' },
  noteText: { fontSize: 13, color: '#7A4E0E', lineHeight: 18 },
  error: { fontSize: 14, color: '#9B2C2C' },
});
