// Read-only contract viewer.
//
// Renders the same legal text as SignContract but with the user's
// captured field values, typed signature, and signed-at timestamp
// embedded — and every input is replaced with rendered Text, so
// nothing here is editable.
//
// Two call sites:
//   • A volunteer / restaurant / exec tapping their own signed
//     agreement in MyContracts → "see what I agreed to"
//   • An admin tapping a user's row in ManageContracts → audit
//
// Navigation params:
//   { kind, uid }    — uid optional; defaults to current signed-in user
//   { kind, profile} — admin shortcut: pass the loaded user doc to
//                      skip the secondary fetch.
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import ResponsiveContainer from '../../components/ui/ResponsiveContainer';
import AnimatedPressable from '../../components/ui/AnimatedPressable';
import Icon from '../../components/ui/Icon';
import useAuthStore from '../../store/authStore';
import { CONTRACTS, roleForKind } from '../../services/contracts';
import { getProfile } from '../../services/auth';

function fmtDate(ts) {
  if (!ts) return '—';
  const ms = ts?.toMillis?.() || new Date(ts).getTime();
  if (!ms) return '—';
  return new Date(ms).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

export default function ContractView({ route, navigation }) {
  const kind = route?.params?.kind;
  const uid  = route?.params?.uid;
  const presetProfile = route?.params?.profile || null;
  const currentUser = useAuthStore((s) => s.user);

  const [profile, setProfile] = useState(presetProfile || (uid ? null : currentUser));
  useEffect(() => {
    if (profile) return;
    if (!uid) return;
    getProfile(uid).then(setProfile).catch(() => setProfile(null));
  }, [uid, profile]);

  const spec = CONTRACTS[kind];
  if (!spec) {
    return (
      <View style={styles.center}>
        <Text>Unknown contract: {String(kind)}</Text>
      </View>
    );
  }
  if (!profile) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.green} />
      </View>
    );
  }

  const block = profile[`contract_${kind}`] || {};
  const signed = !!block.signed;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ResponsiveContainer maxWidth={760}>
        <AnimatedPressable onPress={() => navigation.goBack()} style={styles.back} scaleTo={0.97}>
          <Icon name="back" size={18} color={Colors.green} />
          <Text style={styles.backText}>Back</Text>
        </AnimatedPressable>

        <View style={styles.badge}>
          <Icon name="file" size={14} color={Colors.green} />
          <Text style={styles.badgeText}>
            {roleForKind(kind, profile)} · v{spec.version} · {signed ? 'Signed' : 'Not signed'}
          </Text>
        </View>
        <BrushText variant="screenTitle" style={styles.title}>{spec.title}</BrushText>
        <Text style={styles.subtitle}>{spec.subtitle}</Text>

        {/* Header card with the signer + sign-at metadata */}
        <View style={styles.metaCard}>
          <Row label="Signer" value={block.signed_name || profile.name || '—'} />
          <Row label="Signed at" value={fmtDate(block.signed_at)} />
          <Row label="Version on file" value={String(block.version || '—')} />
          <Row label="Account email" value={profile.email || '—'} />
          {profile.phone ? <Row label="Account phone" value={profile.phone} /> : null}
        </View>

        {/* Captured field values, rendered as read-only rows */}
        {(spec.fields || []).length ? (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Details on file</Text>
            {spec.fields.map((f) => (
              <Row key={f.key} label={f.label} value={block[f.key] || '—'} />
            ))}
          </View>
        ) : null}

        {/* Full legal text */}
        <View style={styles.legalCard}>
          <Text style={styles.legalHeading}>RECITALS</Text>
          {spec.recitals.map((p, i) => (
            <Text key={'r' + i} style={styles.para}>{p}</Text>
          ))}
          {spec.sections.map((sec) => (
            <View key={sec.heading} style={{ marginTop: 14 }}>
              <Text style={styles.legalHeading}>{sec.heading}</Text>
              {sec.body.map((p, i) => (
                <Text key={sec.heading + i} style={[styles.para, p.startsWith('•') && styles.bullet]}>
                  {p}
                </Text>
              ))}
            </View>
          ))}
        </View>

        {/* Signature block — pinned at the bottom like a real document */}
        <View style={styles.signBlock}>
          <Text style={styles.legalHeading}>SIGNATURE</Text>
          <Text style={styles.para}>
            <Text style={{ fontWeight: '700' }}>{block.signed_name || '—'}</Text>
            {block.signed_at ? ` · ${fmtDate(block.signed_at)}` : ''}
          </Text>
          <Text style={styles.signedAs}>
            Electronically signed under the E-SIGN Act (15 U.S.C. § 7001).
          </Text>
        </View>

        <Text style={styles.footer}>
          BetterNature · EIN 99-4028399 · 624 Cypress Knoll Dr, Collierville, TN 38017
        </Text>
      </ResponsiveContainer>
    </ScrollView>
  );
}

function Row({ label, value }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} selectable>{String(value || '—')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
    ...(Platform.OS === 'web' ? { height: '100vh' } : null),
  },
  content: { padding: 24, paddingTop: 60, paddingBottom: 60 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },

  back: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 },
  backText: { fontSize: 15, color: Colors.green, fontWeight: '600' },

  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10, paddingVertical: 4,
    backgroundColor: Colors.greenLight,
    borderRadius: 999, marginTop: 8, marginBottom: 12,
  },
  badgeText: { fontSize: 11, fontWeight: '800', color: Colors.green, letterSpacing: 0.3 },

  title: { color: Colors.green },
  subtitle: { ...Type.caption, color: Colors.gray, marginTop: 4, marginBottom: 18 },

  metaCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: 16,
    borderWidth: 1, borderColor: Colors.glassBorder,
    ...Shadows.soft,
    marginBottom: 14,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: 16,
    borderWidth: 1, borderColor: Colors.glassBorder,
    ...Shadows.soft,
    marginBottom: 14,
  },
  cardLabel: {
    fontSize: 13, fontWeight: '800', color: Colors.dark,
    letterSpacing: 0.3, textTransform: 'uppercase',
    marginBottom: 6,
  },

  row: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.glassBorder,
    gap: 14,
  },
  rowLabel: { fontSize: 12, fontWeight: '700', color: Colors.gray, flexShrink: 0, textTransform: 'uppercase', letterSpacing: 0.2 },
  rowValue: { fontSize: 14, color: Colors.dark, textAlign: 'right', flexShrink: 1 },

  legalCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: 18,
    borderWidth: 1, borderColor: Colors.glassBorder,
    ...Shadows.soft,
    marginBottom: 14,
  },
  legalHeading: {
    fontSize: 13, fontWeight: '800', color: Colors.green,
    letterSpacing: 0.5, textTransform: 'uppercase',
    marginBottom: 8, marginTop: 4,
  },
  para: { ...Type.body, color: Colors.dark, marginBottom: 10, lineHeight: 22 },
  bullet: { paddingLeft: 12 },

  signBlock: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: 18,
    borderWidth: 1, borderColor: Colors.green + '50',
    ...Shadows.card,
    marginBottom: 14,
  },
  signedAs: { ...Type.caption, color: Colors.gray, marginTop: 4, fontStyle: 'italic' },

  footer: { ...Type.caption, color: Colors.gray, textAlign: 'center', marginTop: 8 },
});
