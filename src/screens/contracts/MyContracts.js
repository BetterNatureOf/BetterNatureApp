// Profile → Your signed agreements.
//
// Lists every contract the signed-in user has signed (volunteer +
// possibly restaurant + possibly executive). Tap a row to open the
// read-only ContractView for that kind.
//
// Strictly view-only — no edits, no resign, no delete.
import React from 'react';
import { View, Text, ScrollView, StyleSheet, Platform } from 'react-native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import ResponsiveContainer from '../../components/ui/ResponsiveContainer';
import AnimatedPressable from '../../components/ui/AnimatedPressable';
import Icon from '../../components/ui/Icon';
import useAuthStore from '../../store/authStore';
import { CONTRACTS, roleForKind } from '../../services/contracts';
import Screen from '../../components/ui/Screen';

const ALL_KINDS = ['volunteer', 'restaurant', 'executive', 'president'];

function fmtDate(ts) {
  if (!ts) return '';
  const ms = ts?.toMillis?.() || new Date(ts).getTime();
  if (!ms) return '';
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function MyContracts({ navigation }) {
  const user = useAuthStore((s) => s.user);

  // Build a list of every contract the user has actually signed. We
  // dedupe executive vs. president because they share the same legal
  // doc — show whichever the user signed under.
  const signed = ALL_KINDS
    .filter((k) => user?.[`contract_${k}_signed`])
    // executive + president map to the same spec; collapse if both.
    .filter((k, i, arr) => !(k === 'president' && arr.includes('executive')));

  return (
    <Screen contentStyle={styles.content}>
      <ResponsiveContainer maxWidth={680}>
        <AnimatedPressable onPress={() => navigation.goBack()} style={styles.back} scaleTo={0.97}>
          <Icon name="back" size={18} color={Colors.green} />
          <Text style={styles.backText}>Back</Text>
        </AnimatedPressable>

        <BrushText variant="screenTitle" style={styles.title}>Your signed agreements</BrushText>
        <Text style={styles.subtitle}>
          The agreements you’ve signed with BetterNature. View-only — to make changes, contact info@betternatureofficial.org.
        </Text>

        {signed.length === 0 ? (
          <View style={styles.empty}>
            <Icon name="file" size={26} color={Colors.green} strokeWidth={1.5} />
            <Text style={styles.emptyTitle}>Nothing signed yet</Text>
            <Text style={styles.emptyBody}>
              When you sign a BetterNature agreement, it’ll show up here for your records.
            </Text>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            {signed.map((kind) => {
              const spec = CONTRACTS[kind];
              const block = user[`contract_${kind}`] || {};
              return (
                <AnimatedPressable
                  key={kind}
                  onPress={() => navigation.navigate('ContractView', { kind })}
                  style={styles.row}
                  scaleTo={0.99}
                >
                  <View style={styles.iconWrap}>
                    <Icon name="file" size={20} color={Colors.green} strokeWidth={2.25} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{spec.title}</Text>
                    <Text style={styles.rowMeta}>
                      Signed as {block.signed_name || '—'} · {fmtDate(block.signed_at)} · v{block.version || spec.version}
                    </Text>
                    <Text style={styles.rowRole}>{roleForKind(kind, user)}</Text>
                  </View>
                  <Icon name="chevron" size={18} color={Colors.grayMid} />
                </AnimatedPressable>
              );
            })}
          </View>
        )}
      </ResponsiveContainer>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
    ...(Platform.OS === 'web' ? { height: '100vh' } : null),
  },
  content: { padding: 24, paddingTop: 60, paddingBottom: 60 },

  back: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 },
  backText: { fontSize: 15, color: Colors.green, fontWeight: '600' },

  title: { color: Colors.green, marginTop: 8 },
  subtitle: { ...Type.body, color: Colors.gray, marginTop: 4, marginBottom: 22 },

  empty: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: 22,
    alignItems: 'flex-start',
    gap: 8,
    borderWidth: 1, borderColor: Colors.glassBorder,
  },
  emptyTitle: { fontSize: 15, fontWeight: '800', color: Colors.dark, marginTop: 6 },
  emptyBody: { ...Type.caption },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: 16,
    borderWidth: 1, borderColor: Colors.glassBorder,
    ...Shadows.soft,
  },
  iconWrap: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: Colors.greenLight,
    alignItems: 'center', justifyContent: 'center',
  },
  rowTitle: { fontSize: 15, fontWeight: '800', color: Colors.dark },
  rowMeta: { ...Type.caption, marginTop: 2 },
  rowRole: { ...Type.caption, color: Colors.green, marginTop: 4, fontWeight: '700' },
});
