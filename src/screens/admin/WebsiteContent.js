// Website content editor — full feature parity with the deleted
// betternatureofficial.org/admin.html. Saves a single Firestore doc
// (site_content/main) that the marketing site merges over its
// static content.js defaults at page load. Edits go live on the
// next visitor refresh; no deploy needed.
//
// Sections covered (matches the old admin):
//   - Section visibility toggles
//   - Hero (eyebrow / headlines / subhead / CTAs / ticker stats)
//   - Impact (eyebrow / title / 6 stats with value+label+sublabel)
//   - Programs (eyebrow / title + 3 program cards, each with
//     code, title, blurb, stat line, and N nested stats)
//   - Chapters section header (cards live in Manage Chapters)
//   - Team (members: name, role, city, photo, bio)
//   - Testimonials (quote, name, role, city)
//   - Events (date, time, title, chapter, type, RSVP link)
//   - Partners (name, website, instagram, logo URL)
//   - Brand & contact (email, tagline, socials, donate URL, app store links)
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import Button from '../../components/ui/Button';
import Toggle from '../../components/ui/Toggle';
import ResponsiveContainer from '../../components/ui/ResponsiveContainer';
import Screen from '../../components/ui/Screen';
import useAuthStore from '../../store/authStore';
import { loadSiteContent, saveSiteContent } from '../../services/siteContent';
import { DEFAULT_SITE_CONTENT } from '../../data/defaultSiteContent';
import { notify, confirm } from '../../services/ui';

// All editable section toggles. Matches the SECTION_META array from
// the old admin.html. Each key flips visibility of one homepage block.
const SECTION_META = [
  { key: 'mission',      label: 'Mission',          sub: 'Three-pillar mission statement' },
  { key: 'impact',       label: 'Impact stats',     sub: 'The big pink numbers' },
  { key: 'programs',     label: 'Programs',         sub: 'IRIS / Evergreen / Hydro cards' },
  { key: 'impactmap',    label: 'Impact map',       sub: 'Interactive chapter + gap map' },
  { key: 'bnmap',        label: 'BN Map',           sub: 'World choropleth + fridge tabs' },
  { key: 'how',          label: 'Get Involved',     sub: 'Volunteer / Donate / Partner tabs' },
  { key: 'chapters',     label: 'Chapters',         sub: 'Chapter directory grid' },
  { key: 'partners',     label: 'Partners',         sub: 'Partner logos marquee + pitch' },
  { key: 'testimonials', label: 'Testimonials',     sub: 'Quote cards' },
  { key: 'team',         label: 'Team',             sub: 'Founding team grid' },
  { key: 'events',       label: 'Events',           sub: 'Upcoming events list' },
  { key: 'press',        label: 'Press',            sub: 'Press quotes + publication logos' },
  { key: 'donate',       label: 'Donate',           sub: 'Zeffy embed + giving tiers' },
  { key: 'getapp',       label: 'Get the App',      sub: 'App download / QR code block' },
  { key: 'signup',       label: 'Sign up',          sub: 'Volunteer / start-a-chapter form' },
];

// Empty templates used when adding a new item to an array.
const EMPTY = {
  heroTicker:   () => ({ value: '0', label: '' }),
  impactStat:   () => ({ value: '0', label: '', sublabel: '' }),
  programStat:  () => ({ value: '', label: '' }),
  teamMember:   () => ({ name: '', role: '', city: '', photo: '', bio: '' }),
  testimonial:  () => ({ quote: '', name: '', role: '', city: '' }),
  eventRow:     () => ({ date: '', time: '', title: '', chapter: '', type: '', href: '' }),
  partner:      () => ({ name: '', website: '', instagram: '', logo: '' }),
};

const BLANK = {
  sections: SECTION_META.reduce((acc, s) => { acc[s.key] = true; return acc; }, {}),
  hero: {
    eyebrow: '', headline: '', headlineItalic: '', subhead: '',
    primaryCta:   { text: '', href: '' },
    secondaryCta: { text: '', href: '' },
    tickerStats: [],
  },
  impact:   { eyebrow: '', title: '', stats: [] },
  chapters: { eyebrow: '', title: '', body: '', startChapterUrl: '#signup' },
  programs: {
    eyebrow: '', title: '',
    items: [
      { key: 'iris',      code: '01 — IRIS',      title: '', blurb: '', stat: '', stats: [] },
      { key: 'evergreen', code: '02 — Evergreen', title: '', blurb: '', stat: '', stats: [] },
      { key: 'hydro',     code: '03 — Hydro',     title: '', blurb: '', stat: '', stats: [] },
    ],
  },
  team:         { members: [] },
  testimonials: [],
  events:       [],
  partners:     { logos: [] },
  brand: {
    email: '', tagline: '', instagram: '', twitter: '', facebook: '', donateUrl: '',
    appLinks: { appStore: '', googlePlay: '', webApp: '' },
  },
};

function deepMerge(base, patch) {
  if (Array.isArray(patch)) return patch;
  if (patch && typeof patch === 'object') {
    const out = { ...(base || {}) };
    for (const k of Object.keys(patch)) {
      out[k] = deepMerge(base?.[k], patch[k]);
    }
    return out;
  }
  return patch === undefined ? base : patch;
}

// One stateless field that drives every text input in the editor.
function Field({ label, value, onChange, multiline, half, ...rest }) {
  return (
    <View style={[styles.field, half && { flex: 1 }]}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
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
function Row({ children }) { return <View style={styles.row}>{children}</View>; }
function CollapsibleSection({ label, open, onToggle, children }) {
  return (
    <View style={styles.section}>
      <TouchableOpacity onPress={onToggle} style={styles.sectionHead} activeOpacity={0.85}>
        <Text style={styles.sectionLabel}>{label}</Text>
        <Text style={styles.sectionChev}>{open ? '▾' : '›'}</Text>
      </TouchableOpacity>
      {open ? <View style={{ marginTop: 10 }}>{children}</View> : null}
    </View>
  );
}

export default function WebsiteContent({ navigation }) {
  const user = useAuthStore((s) => s.user);
  const [form, setForm] = useState(BLANK);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [open, setOpen] = useState({ sections: true });

  const toggleOpen = (k) => setOpen((p) => ({ ...p, [k]: !p[k] }));

  const load = useCallback(async () => {
    try {
      const live = await loadSiteContent();
      // Seed order: BLANK shape -> DEFAULT_SITE_CONTENT values
      // (mirrors website/content.js so the editor opens with the
      // homepage copy filled in) -> LIVE Firestore overrides. Later
      // layers win in deepMerge, so user edits take priority over
      // defaults, and defaults take priority over empty shape.
      const withDefaults = deepMerge(BLANK, DEFAULT_SITE_CONTENT);
      setForm(live ? deepMerge(withDefaults, live) : withDefaults);
    } catch (e) {
      console.warn('site content load failed', e);
    } finally {
      setLoaded(true);
      setDirty(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Setter that walks a dot-path. Used by every individual field
  // so we never accidentally mutate the form state in place.
  function set(path, value) {
    setForm((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      let cur = next;
      const keys = path.split('.');
      for (let i = 0; i < keys.length - 1; i++) {
        const k = keys[i];
        const nk = keys[i + 1];
        const wantArr = /^\d+$/.test(nk);
        if (cur[k] == null) cur[k] = wantArr ? [] : {};
        cur = cur[k];
      }
      cur[keys[keys.length - 1]] = value;
      return next;
    });
    setDirty(true);
  }
  function pushTo(path, item) {
    setForm((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      let cur = next;
      const keys = path.split('.');
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        if (i === keys.length - 1) {
          if (!Array.isArray(cur[k])) cur[k] = [];
          cur[k].push(item);
        } else {
          if (cur[k] == null) cur[k] = {};
          cur = cur[k];
        }
      }
      return next;
    });
    setDirty(true);
  }
  function spliceAt(path, idx) {
    setForm((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      let cur = next;
      const keys = path.split('.');
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        if (i === keys.length - 1) {
          if (Array.isArray(cur[k])) cur[k].splice(idx, 1);
        } else { cur = cur[k]; }
      }
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
        notify('Permission denied', 'Only executives can edit website content. Set your role in Manage Members and retry.');
      } else { notify('Could not save', msg); }
    } finally { setSaving(false); }
  }

  async function handleRemove(path, idx, label) {
    const ok = await confirm('Remove this?', label || 'Delete this entry?');
    if (!ok) return;
    spliceAt(path, idx);
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
      <ResponsiveContainer maxWidth={960}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>

        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <BrushText variant="screenTitle" style={styles.title}>Website content</BrushText>
            <Text style={styles.subtitle}>
              Edits go live at betternatureofficial.org on the next visitor refresh. Chapter cards still live in Manage Chapters.
            </Text>
          </View>
          <Button title={dirty ? 'Save changes' : 'Saved'} onPress={handleSave} loading={saving} disabled={!dirty} style={{ minWidth: 140 }} />
        </View>

        {/* SECTIONS visibility */}
        <CollapsibleSection label="Section visibility" open={open.sections} onToggle={() => toggleOpen('sections')}>
          <Text style={styles.muted}>Flip a switch off and that whole block disappears from the homepage.</Text>
          {SECTION_META.map((s) => (
            <View key={s.key} style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleLabel}>{s.label}</Text>
                <Text style={styles.toggleSub}>{s.sub}</Text>
              </View>
              <Toggle
                value={form.sections?.[s.key] !== false}
                onToggle={() => set(`sections.${s.key}`, !(form.sections?.[s.key] !== false))}
              />
            </View>
          ))}
        </CollapsibleSection>

        {/* HERO */}
        <CollapsibleSection label="Hero (top of homepage)" open={open.hero} onToggle={() => toggleOpen('hero')}>
          <Field label="Eyebrow" value={form.hero.eyebrow} onChange={(v) => set('hero.eyebrow', v)} />
          <Field label="Headline" value={form.hero.headline} onChange={(v) => set('hero.headline', v)} />
          <Field label="Headline italic line" value={form.hero.headlineItalic} onChange={(v) => set('hero.headlineItalic', v)} />
          <Field label="Subhead" value={form.hero.subhead} onChange={(v) => set('hero.subhead', v)} multiline />
          <Row>
            <Field label="Primary button text" value={form.hero.primaryCta?.text} onChange={(v) => set('hero.primaryCta.text', v)} half />
            <Field label="Primary button link" value={form.hero.primaryCta?.href} onChange={(v) => set('hero.primaryCta.href', v)} half autoCapitalize="none" />
          </Row>
          <Row>
            <Field label="Secondary button text" value={form.hero.secondaryCta?.text} onChange={(v) => set('hero.secondaryCta.text', v)} half />
            <Field label="Secondary button link" value={form.hero.secondaryCta?.href} onChange={(v) => set('hero.secondaryCta.href', v)} half autoCapitalize="none" />
          </Row>

          <Text style={styles.subsectionLabel}>Ticker stats (small numbers under the hero)</Text>
          {(form.hero.tickerStats || []).map((t, i) => (
            <View key={`ticker-${i}`} style={styles.itemCard}>
              <Text style={styles.itemTitle}>Ticker {i + 1}</Text>
              <Row>
                <Field label="Value" value={t.value} onChange={(v) => set(`hero.tickerStats.${i}.value`, v)} half />
                <Field label="Label" value={t.label} onChange={(v) => set(`hero.tickerStats.${i}.label`, v)} half />
              </Row>
              <Button title="Delete" variant="secondary" onPress={() => handleRemove('hero.tickerStats', i)} style={{ alignSelf: 'flex-start' }} />
            </View>
          ))}
          <Button title="+ Add ticker stat" variant="secondary" onPress={() => pushTo('hero.tickerStats', EMPTY.heroTicker())} style={{ marginTop: 8 }} />
        </CollapsibleSection>

        {/* IMPACT */}
        <CollapsibleSection label="Impact section" open={open.impact} onToggle={() => toggleOpen('impact')}>
          <Field label="Eyebrow" value={form.impact.eyebrow} onChange={(v) => set('impact.eyebrow', v)} />
          <Field label="Title" value={form.impact.title} onChange={(v) => set('impact.title', v)} multiline />
          <Text style={styles.subsectionLabel}>Stats (big pink numbers)</Text>
          {(form.impact.stats || []).map((s, i) => (
            <View key={`impact-${i}`} style={styles.itemCard}>
              <Text style={styles.itemTitle}>Stat {i + 1}</Text>
              <Row>
                <Field label="Value" value={s.value} onChange={(v) => set(`impact.stats.${i}.value`, v)} half />
                <Field label="Label" value={s.label} onChange={(v) => set(`impact.stats.${i}.label`, v)} half />
              </Row>
              <Field label="Sub-label" value={s.sublabel} onChange={(v) => set(`impact.stats.${i}.sublabel`, v)} />
              <Button title="Delete" variant="secondary" onPress={() => handleRemove('impact.stats', i)} style={{ alignSelf: 'flex-start' }} />
            </View>
          ))}
          <Button title="+ Add stat" variant="secondary" onPress={() => pushTo('impact.stats', EMPTY.impactStat())} style={{ marginTop: 8 }} />
        </CollapsibleSection>

        {/* PROGRAMS */}
        <CollapsibleSection label="Programs (IRIS / Evergreen / Hydro)" open={open.programs} onToggle={() => toggleOpen('programs')}>
          <Field label="Eyebrow" value={form.programs.eyebrow} onChange={(v) => set('programs.eyebrow', v)} />
          <Field label="Section title" value={form.programs.title} onChange={(v) => set('programs.title', v)} />
          {form.programs.items.map((item, i) => (
            <View key={item.key || `prog-${i}`} style={styles.itemCard}>
              <Text style={styles.itemTitle}>{item.code || `Program ${i + 1}`}</Text>
              <Field label="Title" value={item.title} onChange={(v) => set(`programs.items.${i}.title`, v)} />
              <Field label="Blurb" value={item.blurb} onChange={(v) => set(`programs.items.${i}.blurb`, v)} multiline />
              <Field label="Stat line (one-liner)" value={item.stat} onChange={(v) => set(`programs.items.${i}.stat`, v)} />
              <Text style={styles.subsectionLabel}>Per-program stats</Text>
              {(item.stats || []).map((s, j) => (
                <Row key={`prog-${i}-stat-${j}`}>
                  <Field label={`Stat ${j + 1} value`} value={s.value} onChange={(v) => set(`programs.items.${i}.stats.${j}.value`, v)} half />
                  <Field label={`Stat ${j + 1} label`} value={s.label} onChange={(v) => set(`programs.items.${i}.stats.${j}.label`, v)} half />
                </Row>
              ))}
              <Button title="+ Add program stat" variant="secondary" onPress={() => pushTo(`programs.items.${i}.stats`, EMPTY.programStat())} style={{ marginTop: 4 }} />
            </View>
          ))}
        </CollapsibleSection>

        {/* CHAPTERS section header */}
        <CollapsibleSection label="Chapters section header" open={open.chapters} onToggle={() => toggleOpen('chapters')}>
          <Field label="Eyebrow" value={form.chapters.eyebrow} onChange={(v) => set('chapters.eyebrow', v)} />
          <Field label="Title" value={form.chapters.title} onChange={(v) => set('chapters.title', v)} />
          <Field label="Body" value={form.chapters.body} onChange={(v) => set('chapters.body', v)} multiline />
          <Field label="Start-a-chapter button link" value={form.chapters.startChapterUrl} onChange={(v) => set('chapters.startChapterUrl', v)} autoCapitalize="none" />
          <Text style={styles.muted}>Chapter cards themselves come from Firestore /chapters (Manage Chapters).</Text>
        </CollapsibleSection>

        {/* TEAM */}
        <CollapsibleSection label="Team" open={open.team} onToggle={() => toggleOpen('team')}>
          {(form.team.members || []).map((m, i) => (
            <View key={`mem-${i}`} style={styles.itemCard}>
              <Text style={styles.itemTitle}>{m.name || 'New member'}</Text>
              <Row>
                <Field label="Name" value={m.name} onChange={(v) => set(`team.members.${i}.name`, v)} half />
                <Field label="Role" value={m.role} onChange={(v) => set(`team.members.${i}.role`, v)} half />
              </Row>
              <Row>
                <Field label="City" value={m.city} onChange={(v) => set(`team.members.${i}.city`, v)} half />
                <Field label="Photo URL" value={m.photo} onChange={(v) => set(`team.members.${i}.photo`, v)} half autoCapitalize="none" />
              </Row>
              <Field label="Bio" value={m.bio} onChange={(v) => set(`team.members.${i}.bio`, v)} multiline />
              <Button title="Delete" variant="secondary" onPress={() => handleRemove('team.members', i, `Remove ${m.name || 'this member'}?`)} style={{ alignSelf: 'flex-start' }} />
            </View>
          ))}
          <Button title="+ Add team member" variant="secondary" onPress={() => pushTo('team.members', EMPTY.teamMember())} style={{ marginTop: 8 }} />
        </CollapsibleSection>

        {/* TESTIMONIALS */}
        <CollapsibleSection label="Testimonials" open={open.testimonials} onToggle={() => toggleOpen('testimonials')}>
          {(form.testimonials || []).map((t, i) => (
            <View key={`t-${i}`} style={styles.itemCard}>
              <Text style={styles.itemTitle}>Quote {i + 1}</Text>
              <Field label="Quote" value={t.quote} onChange={(v) => set(`testimonials.${i}.quote`, v)} multiline />
              <Row>
                <Field label="Name" value={t.name} onChange={(v) => set(`testimonials.${i}.name`, v)} half />
                <Field label="Role" value={t.role} onChange={(v) => set(`testimonials.${i}.role`, v)} half />
              </Row>
              <Field label="City" value={t.city} onChange={(v) => set(`testimonials.${i}.city`, v)} />
              <Button title="Delete" variant="secondary" onPress={() => handleRemove('testimonials', i)} style={{ alignSelf: 'flex-start' }} />
            </View>
          ))}
          <Button title="+ Add testimonial" variant="secondary" onPress={() => pushTo('testimonials', EMPTY.testimonial())} style={{ marginTop: 8 }} />
        </CollapsibleSection>

        {/* EVENTS */}
        <CollapsibleSection label="Events" open={open.events} onToggle={() => toggleOpen('events')}>
          <Text style={styles.muted}>These are the events that appear in the public homepage list. Per-chapter scheduling lives inside the app.</Text>
          {(form.events || []).map((e, i) => (
            <View key={`ev-${i}`} style={styles.itemCard}>
              <Text style={styles.itemTitle}>{e.title || 'New event'}</Text>
              <Row>
                <Field label="Date (YYYY-MM-DD)" value={e.date} onChange={(v) => set(`events.${i}.date`, v)} half autoCapitalize="none" />
                <Field label="Time" value={e.time} onChange={(v) => set(`events.${i}.time`, v)} half />
              </Row>
              <Field label="Title" value={e.title} onChange={(v) => set(`events.${i}.title`, v)} />
              <Row>
                <Field label="Chapter" value={e.chapter} onChange={(v) => set(`events.${i}.chapter`, v)} half />
                <Field label="Type" value={e.type} onChange={(v) => set(`events.${i}.type`, v)} half />
              </Row>
              <Field label="RSVP link (optional)" value={e.href} onChange={(v) => set(`events.${i}.href`, v)} autoCapitalize="none" />
              <Button title="Delete" variant="secondary" onPress={() => handleRemove('events', i, `Remove ${e.title || 'this event'}?`)} style={{ alignSelf: 'flex-start' }} />
            </View>
          ))}
          <Button title="+ Add event" variant="secondary" onPress={() => pushTo('events', EMPTY.eventRow())} style={{ marginTop: 8 }} />
        </CollapsibleSection>

        {/* PARTNERS */}
        <CollapsibleSection label="Partners" open={open.partners} onToggle={() => toggleOpen('partners')}>
          {(form.partners.logos || []).map((p, i) => (
            <View key={`p-${i}`} style={styles.itemCard}>
              <Text style={styles.itemTitle}>{p.name || 'New partner'}</Text>
              <Field label="Partner name" value={p.name} onChange={(v) => set(`partners.logos.${i}.name`, v)} />
              <Row>
                <Field label="Website URL" value={p.website} onChange={(v) => set(`partners.logos.${i}.website`, v)} half autoCapitalize="none" />
                <Field label="Instagram URL" value={p.instagram} onChange={(v) => set(`partners.logos.${i}.instagram`, v)} half autoCapitalize="none" />
              </Row>
              <Field label="Logo image URL (optional)" value={p.logo} onChange={(v) => set(`partners.logos.${i}.logo`, v)} autoCapitalize="none" />
              <Button title="Delete" variant="secondary" onPress={() => handleRemove('partners.logos', i, `Remove ${p.name || 'this partner'}?`)} style={{ alignSelf: 'flex-start' }} />
            </View>
          ))}
          <Button title="+ Add partner" variant="secondary" onPress={() => pushTo('partners.logos', EMPTY.partner())} style={{ marginTop: 8 }} />
        </CollapsibleSection>

        {/* BRAND + contact + socials + app links */}
        <CollapsibleSection label="Brand, contact & socials" open={open.brand} onToggle={() => toggleOpen('brand')}>
          <Row>
            <Field label="Contact email" value={form.brand.email} onChange={(v) => set('brand.email', v)} half autoCapitalize="none" keyboardType="email-address" />
            <Field label="Tagline" value={form.brand.tagline} onChange={(v) => set('brand.tagline', v)} half />
          </Row>
          <Row>
            <Field label="Instagram URL" value={form.brand.instagram} onChange={(v) => set('brand.instagram', v)} half autoCapitalize="none" />
            <Field label="Twitter/X URL" value={form.brand.twitter} onChange={(v) => set('brand.twitter', v)} half autoCapitalize="none" />
          </Row>
          <Row>
            <Field label="Facebook URL" value={form.brand.facebook} onChange={(v) => set('brand.facebook', v)} half autoCapitalize="none" />
            <Field label="Donate URL" value={form.brand.donateUrl} onChange={(v) => set('brand.donateUrl', v)} half autoCapitalize="none" />
          </Row>
          <Text style={styles.subsectionLabel}>App download links</Text>
          <Row>
            <Field label="App Store URL" value={form.brand.appLinks?.appStore} onChange={(v) => set('brand.appLinks.appStore', v)} half autoCapitalize="none" />
            <Field label="Google Play URL" value={form.brand.appLinks?.googlePlay} onChange={(v) => set('brand.appLinks.googlePlay', v)} half autoCapitalize="none" />
          </Row>
          <Field label="Web app URL" value={form.brand.appLinks?.webApp} onChange={(v) => set('brand.appLinks.webApp', v)} autoCapitalize="none" />
        </CollapsibleSection>

        <Button title={dirty ? 'Save changes' : 'No unsaved changes'} onPress={handleSave} loading={saving} disabled={!dirty} style={{ marginTop: 18 }} />
        <Text style={styles.footer}>Last saved by {form.updated_by || '—'}.</Text>
      </ResponsiveContainer>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream, ...(Platform.OS === 'web' ? { height: '100vh' } : null) },
  content: { padding: 24, paddingTop: 60, paddingBottom: 80 },
  back: { fontSize: 16, color: Colors.green, marginBottom: 8 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 20, flexWrap: 'wrap' },
  title: { color: Colors.green, marginBottom: 6 },
  subtitle: { ...Type.body, color: Colors.gray },
  muted: { ...Type.caption, color: Colors.grayMid, marginVertical: 6, fontStyle: 'italic' },

  section: { backgroundColor: Colors.white, borderRadius: Radius.xl, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: Colors.glassBorder, ...Shadows.card },
  sectionHead: { flexDirection: 'row', alignItems: 'center' },
  sectionLabel: { flex: 1, fontSize: 13, fontWeight: '800', color: Colors.green, letterSpacing: 0.4, textTransform: 'uppercase' },
  sectionChev: { fontSize: 22, color: Colors.grayMid },

  subsectionLabel: { fontSize: 11, fontWeight: '800', color: Colors.pink, letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 14, marginBottom: 6 },

  row: { flexDirection: 'row', gap: 10 },
  field: { marginBottom: 10 },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: Colors.gray, marginBottom: 4, letterSpacing: 0.4, textTransform: 'uppercase' },
  input: { borderWidth: 1, borderColor: Colors.glassBorder, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: Colors.dark, backgroundColor: '#FAF8F1' },
  inputMulti: { minHeight: 70 },

  itemCard: { backgroundColor: '#F7F5EF', borderRadius: 12, padding: 12, marginTop: 8 },
  itemTitle: { fontSize: 13, fontWeight: '800', color: Colors.dark, marginBottom: 8 },

  toggleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#EDE7D6', gap: 10 },
  toggleLabel: { fontSize: 14, fontWeight: '700', color: Colors.dark },
  toggleSub: { ...Type.caption, marginTop: 2 },

  footer: { ...Type.caption, color: Colors.grayMid, marginTop: 12, textAlign: 'center' },
});
