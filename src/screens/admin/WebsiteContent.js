// Website content editor. Replaces the deprecated
// betternatureofficial.org/admin.html page. Only execs reach this
// screen (rule-gated via /site_content + UI route gated by role
// in MainNavigator).
//
// Saves go straight to Firestore site_content/main. The marketing
// site reads that doc at page load and merges it over the static
// content.js, so visitors see edits on the next refresh.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import Button from '../../components/ui/Button';
import ResponsiveContainer from '../../components/ui/ResponsiveContainer';
import Screen from '../../components/ui/Screen';
import useAuthStore from '../../store/authStore';
import { loadSiteContent, saveSiteContent } from '../../services/siteContent';
import { notify } from '../../services/ui';

const BLANK = {
  hero: {
    eyebrow: '',
    headline: '',
    headlineItalic: '',
    subhead: '',
    primaryCta:   { text: '', href: '' },
    secondaryCta: { text: '', href: '' },
  },
  impact:   { eyebrow: '', title: '' },
  chapters: { eyebrow: '', title: '', body: '', startChapterUrl: '#signup' },
  programs: {
    eyebrow: '',
    title: '',
    items: [
      { key: 'iris',      code: '01 — IRIS',      title: '', blurb: '', stat: '' },
      { key: 'evergreen', code: '02 — Evergreen', title: '', blurb: '', stat: '' },
      { key: 'hydro',     code: '03 — Hydro',     title: '', blurb: '', stat: '' },
    ],
  },
  contact:  { email: '', instagram: '', phone: '', address: '' },
};

function deepMerge(base, patch) {
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const k of Object.keys(patch || {})) {
    const v = patch[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && typeof base?.[k] === 'object' && !Array.isArray(base?.[k])) {
      out[k] = deepMerge(base[k] || {}, v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export default function WebsiteContent({ navigation }) {
  const user = useAuthStore((s) => s.user);
  const [form, setForm] = useState(BLANK);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    try {
      const live = await loadSiteContent();
      setForm(live ? deepMerge(BLANK, live) : BLANK);
    } catch (e) {
      console.warn('site content load failed', e);
    } finally {
      setLoaded(true);
      setDirty(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  function set(path, value) {
    setForm((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      let cur = next;
      const keys = path.split('.');
      for (let i = 0; i < keys.length - 1; i++) cur = cur[keys[i]] = cur[keys[i]] ?? {};
      cur[keys[keys.length - 1]] = value;
      return next;
    });
    setDirty(true);
  }
  function setProgramItem(i, field, value) {
    setForm((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      next.programs.items[i] = { ...next.programs.items[i], [field]: value };
      return next;
    });
    setDirty(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await saveSiteContent(form, user?.email || user?.id || null);
      notify('Saved', 'Visitors see your edits on the next page load of betternatureofficial.org.');
      setDirty(false);
    } catch (e) {
      const code = (e?.code || '').toLowerCase();
      const msg = e?.message || 'Try again.';
      if (code.includes('permission-denied') || msg.toLowerCase().includes('missing or insufficient')) {
        notify('Permission denied', 'Only executives can edit website content. Open Manage Members and set your role to Executive first.');
      } else {
        notify('Could not save', msg);
      }
    } finally { setSaving(false); }
  }

  if (!loaded) {
    return (
      <Screen contentStyle={styles.content}>
        <Text style={styles.muted}>Loading…</Text>
      </Screen>
    );
  }

  return (
    <Screen contentStyle={styles.content}>
      <ResponsiveContainer maxWidth={900}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>

        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <BrushText variant="screenTitle" style={styles.title}>Website content</BrushText>
            <Text style={styles.subtitle}>
              Edits go live at betternatureofficial.org on the next page load. Chapters live in Manage Chapters — everything else here.
            </Text>
          </View>
          <Button title={dirty ? 'Save changes' : 'Saved'} onPress={handleSave} loading={saving} disabled={!dirty} style={{ minWidth: 140 }} />
        </View>

        {/* HERO */}
        <Section label="Hero (top of homepage)">
          <Field label="Eyebrow" value={form.hero.eyebrow} onChange={(v) => set('hero.eyebrow', v)} />
          <Field label="Headline" value={form.hero.headline} onChange={(v) => set('hero.headline', v)} />
          <Field label="Headline italic line" value={form.hero.headlineItalic} onChange={(v) => set('hero.headlineItalic', v)} />
          <Field label="Subhead" value={form.hero.subhead} onChange={(v) => set('hero.subhead', v)} multiline />
          <Row>
            <Field label="Primary button text" value={form.hero.primaryCta.text} onChange={(v) => set('hero.primaryCta.text', v)} half />
            <Field label="Primary button link" value={form.hero.primaryCta.href} onChange={(v) => set('hero.primaryCta.href', v)} half autoCapitalize="none" />
          </Row>
          <Row>
            <Field label="Secondary button text" value={form.hero.secondaryCta.text} onChange={(v) => set('hero.secondaryCta.text', v)} half />
            <Field label="Secondary button link" value={form.hero.secondaryCta.href} onChange={(v) => set('hero.secondaryCta.href', v)} half autoCapitalize="none" />
          </Row>
        </Section>

        {/* IMPACT */}
        <Section label="Impact section">
          <Field label="Eyebrow" value={form.impact.eyebrow} onChange={(v) => set('impact.eyebrow', v)} />
          <Field label="Title" value={form.impact.title} onChange={(v) => set('impact.title', v)} multiline />
          <Text style={styles.muted}>The big numbers (meals, lbs, etc.) come from live org_stats and aren't edited here.</Text>
        </Section>

        {/* CHAPTERS HEADER */}
        <Section label="Chapters section header">
          <Field label="Eyebrow" value={form.chapters.eyebrow} onChange={(v) => set('chapters.eyebrow', v)} />
          <Field label="Title" value={form.chapters.title} onChange={(v) => set('chapters.title', v)} />
          <Field label="Body" value={form.chapters.body} onChange={(v) => set('chapters.body', v)} multiline />
          <Field label="Start-a-chapter button link" value={form.chapters.startChapterUrl} onChange={(v) => set('chapters.startChapterUrl', v)} autoCapitalize="none" />
          <Text style={styles.muted}>The chapter cards themselves come from Firestore /chapters (Manage Chapters).</Text>
        </Section>

        {/* PROGRAMS */}
        <Section label="Programs (IRIS / Evergreen / Hydro)">
          <Field label="Eyebrow" value={form.programs.eyebrow} onChange={(v) => set('programs.eyebrow', v)} />
          <Field label="Section title" value={form.programs.title} onChange={(v) => set('programs.title', v)} />
          {form.programs.items.map((item, i) => (
            <View key={item.key} style={styles.programCard}>
              <Text style={styles.programLabel}>{item.code}</Text>
              <Field label="Title" value={item.title} onChange={(v) => setProgramItem(i, 'title', v)} />
              <Field label="Blurb" value={item.blurb} onChange={(v) => setProgramItem(i, 'blurb', v)} multiline />
              <Field label="Stat line (e.g. '12,450 meals delivered')" value={item.stat} onChange={(v) => setProgramItem(i, 'stat', v)} />
            </View>
          ))}
        </Section>

        {/* CONTACT */}
        <Section label="Contact + social">
          <Row>
            <Field label="Email" value={form.contact.email} onChange={(v) => set('contact.email', v)} half autoCapitalize="none" keyboardType="email-address" />
            <Field label="Instagram URL" value={form.contact.instagram} onChange={(v) => set('contact.instagram', v)} half autoCapitalize="none" />
          </Row>
          <Row>
            <Field label="Phone" value={form.contact.phone} onChange={(v) => set('contact.phone', v)} half />
            <Field label="Address" value={form.contact.address} onChange={(v) => set('contact.address', v)} half />
          </Row>
        </Section>

        <Button title={dirty ? 'Save changes' : 'No unsaved changes'} onPress={handleSave} loading={saving} disabled={!dirty} style={{ marginTop: 18 }} />
        <Text style={styles.footer}>
          Last saved by {form.updated_by || '—'}.
        </Text>
      </ResponsiveContainer>
    </Screen>
  );
}

function Section({ label, children }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {children}
    </View>
  );
}
function Row({ children }) {
  return <View style={styles.row}>{children}</View>;
}
function Field({ label, value, onChange, multiline, half, ...rest }) {
  return (
    <View style={[styles.field, half && { flex: 1 }]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.inputMulti]}
        value={value ?? ''}
        onChangeText={onChange}
        multiline={!!multiline}
        textAlignVertical={multiline ? 'top' : 'auto'}
        {...rest}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream, ...(Platform.OS === 'web' ? { height: '100vh' } : null) },
  content: { padding: 24, paddingTop: 60, paddingBottom: 80 },
  back: { fontSize: 16, color: Colors.green, marginBottom: 8 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 20, flexWrap: 'wrap' },
  title: { color: Colors.green, marginBottom: 6 },
  subtitle: { ...Type.body, color: Colors.gray },
  muted: { ...Type.caption, color: Colors.grayMid, marginTop: 6, fontStyle: 'italic' },
  section: { backgroundColor: Colors.white, borderRadius: Radius.xl, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: Colors.glassBorder, ...Shadows.card },
  sectionLabel: { fontSize: 13, fontWeight: '800', color: Colors.green, marginBottom: 10, letterSpacing: 0.4, textTransform: 'uppercase' },
  row: { flexDirection: 'row', gap: 10 },
  field: { marginBottom: 10 },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: Colors.gray, marginBottom: 4, letterSpacing: 0.4, textTransform: 'uppercase' },
  input: { borderWidth: 1, borderColor: Colors.glassBorder, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: Colors.dark, backgroundColor: '#FAF8F1' },
  inputMulti: { minHeight: 70 },
  programCard: { backgroundColor: '#F7F5EF', borderRadius: 12, padding: 12, marginTop: 8 },
  programLabel: { fontSize: 11, fontWeight: '800', color: Colors.pink, marginBottom: 8, letterSpacing: 0.6, textTransform: 'uppercase' },
  footer: { ...Type.caption, color: Colors.grayMid, marginTop: 12, textAlign: 'center' },
});
