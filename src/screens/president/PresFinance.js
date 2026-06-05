// Chapter-level finance + roster export. A chapter president can
// see donations attributed to their chapter (Zeffy + future
// processors stamp chapter_id on the donation doc when the link
// is shared from inside the chapter), and download a CSV roster
// for their own records / email signups / 990 prep at the chapter
// level.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import Button from '../../components/ui/Button';
import ResponsiveContainer from '../../components/ui/ResponsiveContainer';
import Screen from '../../components/ui/Screen';
import useAuthStore from '../../store/authStore';
import { fetchAllDonations, fetchAllMembers, fetchChapterById, fetchEvents } from '../../services/database';
import { notify } from '../../services/ui';

function fmtMoney(n) {
  return `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function csvEscape(s) {
  if (s == null) return '';
  const str = String(s);
  if (/[",\n]/.test(str)) return '"' + str.replace(/"/g, '""') + '"';
  return str;
}

function triggerDownload(filename, text) {
  if (Platform.OS !== 'web') return false;
  try {
    const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch { return false; }
}

export default function PresFinance({ navigation }) {
  const user = useAuthStore((s) => s.user);
  const [chapter, setChapter]     = useState(null);
  const [members, setMembers]     = useState([]);
  const [donations, setDonations] = useState([]);
  const [events, setEvents]       = useState([]);

  const load = useCallback(async () => {
    if (!user?.chapter_id) return;
    try {
      const [ch, mAll, dAll, ev] = await Promise.all([
        fetchChapterById(user.chapter_id),
        fetchAllMembers(),
        fetchAllDonations(),
        fetchEvents(user.chapter_id),
      ]);
      setChapter(ch);
      setMembers(mAll.filter((u) => u.chapter_id === user.chapter_id && (u.role || 'member') !== 'restaurant'));
      // Match donations both by chapter_id (clean stamp) and by
      // donor's chapter_id (best-effort attribution).
      setDonations(dAll.filter((d) => d.chapter_id === user.chapter_id || mAll.find((u) => u.id === d.user_id)?.chapter_id === user.chapter_id));
      setEvents(ev || []);
    } catch (e) {
      console.warn('PresFinance load', e);
    }
  }, [user?.chapter_id]);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const thisYear = new Date().getFullYear();
  const ytd = donations
    .filter((d) => {
      const t = d.created_at?.toDate ? d.created_at.toDate() : new Date(d.created_at);
      return t.getFullYear() === thisYear;
    })
    .reduce((s, d) => s + (Number(d.amount) || 0), 0);
  const lifetime = donations.reduce((s, d) => s + (Number(d.amount) || 0), 0);
  const totalLbs = members.reduce((s, u) => s + (u.lbs_rescued || Math.round((u.meals_rescued || 0) / 1.2)), 0);
  const totalHours = members.reduce((s, u) => s + (u.hours_logged || 0), 0);

  const recentDonations = useMemo(() => [...donations]
    .sort((a, b) => {
      const ta = a.created_at?.toMillis?.() || 0;
      const tb = b.created_at?.toMillis?.() || 0;
      return tb - ta;
    })
    .slice(0, 10), [donations]);

  function exportRoster() {
    const header = ['Name', 'Email', 'Phone', 'Role', 'Events', 'Lbs', 'Hours'];
    const rows = members.map((m) => [
      m.name || '',
      m.email || '',
      m.phone || '',
      m.role || 'member',
      m.events_attended || 0,
      m.lbs_rescued || Math.round((m.meals_rescued || 0) / 1.2),
      m.hours_logged || 0,
    ].map(csvEscape).join(','));
    const csv = [header.join(','), ...rows].join('\n');
    if (!triggerDownload(`${(chapter?.name || 'chapter').toLowerCase().replace(/\s+/g, '-')}-roster.csv`, csv)) {
      notify('Export needs a browser', 'Open the chapter on the web app and tap Export Roster there.');
    }
  }

  function exportDonations() {
    const header = ['Date', 'Donor', 'Amount', 'Project', 'Reference'];
    const rows = donations.map((d) => {
      const t = d.created_at?.toDate ? d.created_at.toDate() : new Date(d.created_at);
      return [
        isNaN(t) ? '' : t.toISOString().slice(0, 10),
        members.find((u) => u.id === d.user_id)?.name || d.donor_name || '',
        Number(d.amount) || 0,
        d.project || 'general',
        d.id,
      ].map(csvEscape).join(',');
    });
    const csv = [header.join(','), ...rows].join('\n');
    if (!triggerDownload(`${(chapter?.name || 'chapter').toLowerCase().replace(/\s+/g, '-')}-donations.csv`, csv)) {
      notify('Export needs a browser', 'Open the chapter on the web app and tap Export Donations there.');
    }
  }

  if (!user?.chapter_id) {
    return (
      <Screen contentStyle={styles.content}>
        <ResponsiveContainer maxWidth={760}>
          <TouchableOpacity onPress={() => navigation.goBack()}><Text style={styles.back}>‹ Back</Text></TouchableOpacity>
          <BrushText variant="screenTitle" style={styles.title}>Chapter finance</BrushText>
          <Text style={styles.subtitle}>You're not assigned to a chapter yet. Ask an exec to assign you.</Text>
        </ResponsiveContainer>
      </Screen>
    );
  }

  return (
    <Screen contentStyle={styles.content}>
      <ResponsiveContainer maxWidth={1000}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Text style={styles.back}>‹ Back</Text></TouchableOpacity>
        <BrushText variant="screenTitle" style={styles.title}>Chapter finance</BrushText>
        <Text style={styles.subtitle}>
          {chapter?.name || 'Your chapter'} · {members.length} {members.length === 1 ? 'member' : 'members'} · {events.length} events
        </Text>

        <View style={styles.kpis}>
          <Kpi label={`Raised ${thisYear}`} value={fmtMoney(ytd)} />
          <Kpi label="Lifetime raised" value={fmtMoney(lifetime)} />
          <Kpi label="Pounds of food rescued" value={totalLbs.toLocaleString('en-US')} />
          <Kpi label="Volunteer hours" value={`${totalHours.toLocaleString('en-US')}h`} />
        </View>

        <View style={styles.actionsRow}>
          <Button title="Export roster (CSV)" onPress={exportRoster} style={{ flex: 1, marginRight: 6 }} />
          <Button title="Export donations (CSV)" variant="secondary" onPress={exportDonations} style={{ flex: 1, marginLeft: 6 }} />
        </View>

        <Text style={styles.sectionLabel}>Recent donations</Text>
        {recentDonations.length === 0 ? (
          <Text style={styles.muted}>No chapter-attributed donations yet. Share your chapter's Zeffy link to start tracking them here.</Text>
        ) : (
          recentDonations.map((d) => {
            const donor = members.find((u) => u.id === d.user_id);
            const t = d.created_at?.toDate ? d.created_at.toDate() : new Date(d.created_at);
            return (
              <View key={d.id} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowAmount}>{fmtMoney(d.amount)}</Text>
                  <Text style={styles.rowMeta}>
                    {donor?.name || d.donor_name || 'Anonymous'} · {isNaN(t) ? '' : t.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    {d.project ? `  · ${d.project}` : ''}
                  </Text>
                </View>
              </View>
            );
          })
        )}
      </ResponsiveContainer>
    </Screen>
  );
}

function Kpi({ label, value }) {
  return (
    <View style={styles.kpi}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream, ...(Platform.OS === 'web' ? { height: '100vh' } : null) },
  content: { padding: 24, paddingTop: 60, paddingBottom: 60 },
  back: { fontSize: 16, color: Colors.green, marginBottom: 8 },
  title: { color: Colors.green, marginBottom: 6 },
  subtitle: { ...Type.body, color: Colors.gray, marginBottom: 18 },
  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  kpi: { flexGrow: 1, flexBasis: 180, backgroundColor: Colors.white, borderRadius: Radius.xl, padding: 14, borderWidth: 1, borderColor: Colors.glassBorder, ...Shadows.card },
  kpiLabel: { ...Type.caption, fontWeight: '700' },
  kpiValue: { fontSize: 22, fontWeight: '800', color: Colors.green, marginTop: 4 },
  actionsRow: { flexDirection: 'row', marginTop: 8, marginBottom: 18 },
  sectionLabel: { fontSize: 13, fontWeight: '800', color: Colors.green, marginTop: 14, marginBottom: 10, letterSpacing: 0.4, textTransform: 'uppercase' },
  muted: { ...Type.caption, color: Colors.grayMid, fontStyle: 'italic' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.white, borderRadius: Radius.lg, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: Colors.glassBorder },
  rowAmount: { fontSize: 17, fontWeight: '800', color: Colors.green },
  rowMeta: { ...Type.caption, marginTop: 2 },
});
