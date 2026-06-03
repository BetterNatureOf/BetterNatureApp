// Admin → Manage Contracts.
//
// Every signed agreement across every account, filterable by kind +
// searchable by name / email / business. Tap a row to open the full
// read-only contract in ContractView. Revoke action drops the
// contract_{kind}_signed flag so the gate forces a re-sign.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator, Platform, TextInput,
} from 'react-native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import ResponsiveContainer from '../../components/ui/ResponsiveContainer';
import AnimatedPressable from '../../components/ui/AnimatedPressable';
import Icon from '../../components/ui/Icon';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { fetchAllMembers } from '../../services/database';
import { CONTRACTS, roleForKind } from '../../services/contracts';
import { notify, confirm } from '../../services/ui';
import Screen from '../../components/ui/Screen';

const FILTERS = [
  { key: 'all',         label: 'All' },
  { key: 'volunteer',   label: 'Volunteers' },
  { key: 'restaurant',  label: 'Restaurants' },
  { key: 'executive',   label: 'Executives' },
  { key: 'president',   label: 'Presidents' },
];

function fmtDate(ts) {
  if (!ts) return '';
  const ms = ts?.toMillis?.() || new Date(ts).getTime();
  if (!ms) return '';
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Flatten the users list into one row per signed contract.
function explode(members) {
  const out = [];
  const kinds = ['volunteer', 'restaurant', 'executive', 'president'];
  for (const u of members || []) {
    for (const k of kinds) {
      if (!u[`contract_${k}_signed`]) continue;
      const block = u[`contract_${k}`] || {};
      out.push({
        rowKey: u.id + ':' + k,
        kind: k,
        user: u,
        block,
        signed_at: block.signed_at,
      });
    }
  }
  out.sort((a, b) => {
    const aMs = a.signed_at?.toMillis?.() || new Date(a.signed_at || 0).getTime();
    const bMs = b.signed_at?.toMillis?.() || new Date(b.signed_at || 0).getTime();
    return bMs - aMs; // newest first
  });
  return out;
}

export default function ManageContracts({ navigation }) {
  const [members, setMembers] = useState(null);
  const [filter,  setFilter]  = useState('all');
  const [q,       setQ]       = useState('');
  const [busy,    setBusy]    = useState(null);

  const load = useCallback(async () => {
    try { setMembers(await fetchAllMembers()); }
    catch { setMembers([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const all = useMemo(() => explode(members), [members]);

  const counts = useMemo(() => ({
    all:        all.length,
    volunteer:  all.filter((r) => r.kind === 'volunteer').length,
    restaurant: all.filter((r) => r.kind === 'restaurant').length,
    executive:  all.filter((r) => r.kind === 'executive').length,
    president:  all.filter((r) => r.kind === 'president').length,
  }), [all]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter((r) => {
      if (filter !== 'all' && r.kind !== filter) return false;
      if (!needle) return true;
      const haystack = [
        r.user.name, r.user.email, r.user.phone,
        r.block.legal_name, r.block.signed_name,
        r.block.business_legal_name, r.block.contact_name,
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(needle);
    });
  }, [all, filter, q]);

  async function revoke(row) {
    const who = row.user.name || row.user.email;
    const ok = await confirm(
      `Revoke this contract?`,
      `${who} will have to re-sign the ${CONTRACTS[row.kind].title} before they can keep using the role.`,
    );
    if (!ok) return;
    setBusy(row.rowKey);
    try {
      await updateDoc(doc(db, 'users', row.user.id), {
        [`contract_${row.kind}_signed`]: false,
        [`contract_${row.kind}.signed`]: false,
        [`contract_${row.kind}.revoked_at`]: new Date().toISOString(),
      });
      await load();
      notify('Revoked', `${who} will be prompted to re-sign on next access.`);
    } catch (e) {
      notify('Could not revoke', e?.message || 'Try again.');
    } finally { setBusy(null); }
  }

  return (
    <Screen contentStyle={styles.content}>
      <ResponsiveContainer maxWidth={920}>
        <AnimatedPressable onPress={() => navigation.goBack()} style={styles.back} scaleTo={0.97}>
          <Icon name="back" size={18} color={Colors.green} />
          <Text style={styles.backText}>Back</Text>
        </AnimatedPressable>
        <BrushText variant="screenTitle" style={styles.title}>Manage contracts</BrushText>
        <Text style={styles.subtitle}>
          Every signed agreement across all accounts. View the full text + signature, search by name or business, revoke when a role ends.
        </Text>

        <View style={styles.pills}>
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <AnimatedPressable
                key={f.key}
                onPress={() => setFilter(f.key)}
                style={[styles.pill, active && styles.pillOn]}
                scaleTo={0.96}
              >
                <Text style={[styles.pillText, active && styles.pillTextOn]}>
                  {f.label} · {counts[f.key] || 0}
                </Text>
              </AnimatedPressable>
            );
          })}
        </View>

        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search name, business, email…"
          placeholderTextColor={Colors.grayMid}
          style={styles.search}
        />

        {members === null ? (
          <View style={styles.center}><ActivityIndicator color={Colors.green} /></View>
        ) : visible.length === 0 ? (
          <View style={styles.empty}>
            <Icon name="file" size={26} color={Colors.green} strokeWidth={1.5} />
            <Text style={styles.emptyTitle}>No matches</Text>
            <Text style={styles.emptyBody}>
              {q ? 'Try a different search term.' : 'No agreements in this category yet.'}
            </Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {visible.map((row) => {
              const spec = CONTRACTS[row.kind];
              const u = row.user;
              const business = row.block.business_legal_name;
              return (
                <View key={row.rowKey} style={styles.row}>
                  <View style={styles.iconWrap}>
                    <Icon name="file" size={18} color={Colors.green} strokeWidth={2.25} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>
                      {business
                        ? `${business} (${row.block.business_type || 'business'})`
                        : (row.block.legal_name || row.block.signed_name || u.name || u.email || '—')}
                    </Text>
                    <Text style={styles.rowMeta}>
                      {spec.title} · v{row.block.version || spec.version}
                    </Text>
                    <Text style={styles.rowMeta}>
                      Signed: {row.block.signed_name || '—'} · {fmtDate(row.signed_at)}
                    </Text>
                    <Text style={styles.rowContact}>
                      {u.email || '—'}{u.phone ? ' · ' + u.phone : ''}
                    </Text>
                    <Text style={styles.rowRole}>{roleForKind(row.kind, u)}</Text>
                  </View>
                  <View style={styles.rowActions}>
                    <AnimatedPressable
                      style={[styles.actBtn, styles.viewBtn]}
                      onPress={() => navigation.navigate('ContractView', { kind: row.kind, profile: u })}
                      scaleTo={0.96}
                    >
                      <Text style={styles.viewText}>View</Text>
                    </AnimatedPressable>
                    <AnimatedPressable
                      style={[styles.actBtn, styles.revokeBtn]}
                      onPress={() => revoke(row)}
                      disabled={busy === row.rowKey}
                      scaleTo={0.96}
                    >
                      <Text style={styles.revokeText}>{busy === row.rowKey ? '…' : 'Revoke'}</Text>
                    </AnimatedPressable>
                  </View>
                </View>
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
  center: { paddingVertical: 36, alignItems: 'center' },

  back: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 },
  backText: { fontSize: 15, color: Colors.green, fontWeight: '600' },

  title: { color: Colors.green, marginTop: 8 },
  subtitle: { ...Type.body, color: Colors.gray, marginTop: 4, marginBottom: 18 },

  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  pill: {
    paddingVertical: 8, paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: Colors.white,
    borderWidth: 1.5, borderColor: Colors.glassBorder,
  },
  pillOn: { backgroundColor: Colors.green, borderColor: Colors.green },
  pillText: { fontSize: 13, fontWeight: '700', color: Colors.dark },
  pillTextOn: { color: Colors.white },

  search: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1.5, borderColor: Colors.glassBorder,
    paddingVertical: 12, paddingHorizontal: 14,
    fontSize: 15, color: Colors.dark,
    marginBottom: 14,
  },

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
    flexDirection: 'row', gap: 14,
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: 14,
    borderWidth: 1, borderColor: Colors.glassBorder,
    ...Shadows.soft,
  },
  iconWrap: {
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: Colors.greenLight,
    alignItems: 'center', justifyContent: 'center',
  },
  rowTitle: { fontSize: 15, fontWeight: '800', color: Colors.dark },
  rowMeta:  { ...Type.caption, marginTop: 2 },
  rowContact: { ...Type.caption, marginTop: 6, color: Colors.dark },
  rowRole:  { ...Type.caption, color: Colors.green, marginTop: 4, fontWeight: '700' },

  rowActions: { gap: 8, justifyContent: 'center' },
  actBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, alignItems: 'center' },
  viewBtn: { backgroundColor: Colors.green },
  viewText: { color: Colors.white, fontSize: 12, fontWeight: '800', letterSpacing: 0.3 },
  revokeBtn: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: Colors.pink },
  revokeText: { color: Colors.pink, fontSize: 12, fontWeight: '800', letterSpacing: 0.3 },
});
