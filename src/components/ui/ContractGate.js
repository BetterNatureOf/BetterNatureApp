// ContractGate — drop in around any role-restricted screen.
//
// Reads the signed-in user and a `kind` prop. If the user's role
// requires that contract AND they haven't signed the current version,
// the gate renders a friendly stop card with a "Sign now" CTA. Otherwise
// it renders the wrapped children as-is.
//
// Used by:
//   - RestDashboard, ScheduleDonation → ContractGate kind="restaurant"
//   - ExecutiveDashboard, AdminPanel  → ContractGate kind="executive"
//   - PresidentDashboard               → ContractGate kind="president"
//
// Designed to be the ONLY thing rendered when blocked — so an admin who
// hasn't signed the exec agreement literally cannot see the admin
// panel until they sign.
import React from 'react';
import { View, Text, StyleSheet, Platform, ScrollView } from 'react-native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from './BrushText';
import Button from './Button';
import ResponsiveContainer from './ResponsiveContainer';
import Icon from './Icon';
import AnimatedPressable from './AnimatedPressable';
import useAuthStore from '../../store/authStore';
import { CONTRACTS, hasSignedContract } from '../../services/contracts';
import { signOut } from '../../services/auth';
import { useNavigation } from '@react-navigation/native';

export default function ContractGate({ kind, children }) {
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.signOut);
  const navigation = useNavigation();
  const spec = CONTRACTS[kind];

  // Unknown kind → never block (defensive).
  if (!spec) return children;
  // Already signed (and version is current) → render the wrapped screen.
  if (hasSignedContract(user, kind)) return children;

  async function handleSignOut() {
    try { await signOut(); } catch {}
    clearAuth();
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      <ResponsiveContainer maxWidth={580}>
        <View style={styles.badge}>
          <Icon name="lock" size={14} color={Colors.green} />
          <Text style={styles.badgeText}>One step left</Text>
        </View>
        <BrushText variant="screenTitle" style={styles.title}>{spec.title}</BrushText>
        <Text style={styles.subtitle}>
          {kindBlurb(kind)}
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>What you’re agreeing to</Text>
          {/* The new CONTRACTS shape stores legal text under
              spec.recitals (preamble paragraphs) + spec.sections
              (numbered sections). Earlier versions used a flat
              spec.clauses array — when we updated contracts.js to the
              real legal text from the .docx files, this component
              didn't get migrated and was reading spec.clauses[0] on
              undefined, which is exactly the "reading '0' of undefined"
              error people saw on the Org / Restaurant / President /
              Admin tabs. */}
          <Text style={styles.cardBody}>
            {(spec.recitals && spec.recitals[0]) ||
             (spec.sections && spec.sections[0]?.body?.[0]) ||
             'See the full agreement to review the terms.'}
          </Text>
          <Text style={styles.cardMore}>
            + {(spec.sections?.length ?? 0)} more sections on the full form.
          </Text>
        </View>

        <Button
          title="Open the agreement"
          onPress={() => navigation.navigate('SignContract', { kind })}
          style={{ marginTop: 16 }}
        />

        <AnimatedPressable onPress={handleSignOut} style={styles.signOutBtn} scaleTo={0.97}>
          <Text style={styles.signOutText}>Not now — sign out</Text>
        </AnimatedPressable>
      </ResponsiveContainer>
    </ScrollView>
  );
}

function kindBlurb(kind) {
  if (kind === 'restaurant') return 'Before you can post surplus, we need a one-time partner agreement and your restaurant’s contact info on file.';
  if (kind === 'executive')  return 'Executive access is locked until you sign the officer agreement. Takes about two minutes.';
  if (kind === 'president')  return 'Chapter-president access is locked until you sign the role agreement. Takes about a minute.';
  return 'Sign the agreement to access this area.';
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
    ...(Platform.OS === 'web' ? { height: '100vh' } : null),
  },
  content: { padding: 24, paddingTop: 80, paddingBottom: 60 },

  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10, paddingVertical: 4,
    backgroundColor: Colors.greenLight,
    borderRadius: 999,
    marginBottom: 12,
  },
  badgeText: { fontSize: 11, fontWeight: '800', color: Colors.green, letterSpacing: 0.3 },

  title: { color: Colors.green },
  subtitle: { ...Type.body, color: Colors.gray, marginTop: 6, marginBottom: 22 },

  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: 18,
    borderWidth: 1, borderColor: Colors.glassBorder,
    ...Shadows.card,
  },
  cardTitle: { fontSize: 13, fontWeight: '800', color: Colors.dark, letterSpacing: 0.3, textTransform: 'uppercase', marginBottom: 8 },
  cardBody: { ...Type.body, color: Colors.dark, lineHeight: 22 },
  cardMore: { ...Type.caption, marginTop: 10 },

  signOutBtn: { alignSelf: 'center', paddingVertical: 14, marginTop: 4 },
  signOutText: { fontSize: 13, fontWeight: '600', color: Colors.pink },
});
