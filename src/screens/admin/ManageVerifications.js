// Admin → Manage verifications.
//
// Shows every user who has uploaded an ID. Filter pills let admins
// triage Pending vs. Approved vs. Rejected. For each row:
//   • The ID image (tap → full-screen)
//   • The user's name, email, phone, city
//   • The signed waiver record (name + date) if present
//   • Approve / Reject buttons
//
// Verification status lives on users/{uid}.verification_status, one
// of 'pending' | 'approved' | 'rejected'. The ID-gate (services/idGate)
// reads this when deciding whether to let a member claim pickups.
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Image, StyleSheet, ActivityIndicator,
  Modal, TouchableOpacity, Platform,
} from 'react-native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import ResponsiveContainer from '../../components/ui/ResponsiveContainer';
import AnimatedPressable from '../../components/ui/AnimatedPressable';
import Icon from '../../components/ui/Icon';
import { fetchAllMembers } from '../../services/database';
import { setVerificationStatus } from '../../services/verifications';
import { notify, confirm } from '../../services/ui';

const FILTERS = [
  { key: 'pending',  label: 'Pending review' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
];

function statusOf(u) {
  if (u.verification_status) return u.verification_status;
  // Legacy users who uploaded before this screen existed — treat as
  // pending so an admin actually looks at the file.
  if (u.id_document_url) return 'pending';
  return 'none';
}

export default function ManageVerifications({ navigation }) {
  const [filter, setFilter] = useState('pending');
  const [members, setMembers] = useState(null);
  const [busy, setBusy] = useState(null);          // uid currently being acted on
  const [lightbox, setLightbox] = useState(null);  // uri of the image to enlarge

  const load = useCallback(async () => {
    try { setMembers(await fetchAllMembers()); }
    catch { setMembers([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Only users who actually uploaded something show up here. Then we
  // bucket by status.
  const withIds = (members || []).filter((m) => m.id_document_url);
  const inBucket = withIds.filter((m) => statusOf(m) === filter);

  const counts = {
    pending:  withIds.filter((m) => statusOf(m) === 'pending').length,
    approved: withIds.filter((m) => statusOf(m) === 'approved').length,
    rejected: withIds.filter((m) => statusOf(m) === 'rejected').length,
  };

  async function approve(u) {
    setBusy(u.id);
    try {
      await setVerificationStatus(u.id, 'approved');
      await load();
      notify('Approved', `${u.name || u.email} can now claim pickups.`);
    } catch (e) {
      notify('Could not approve', e?.message || 'Try again.');
    } finally { setBusy(null); }
  }

  async function reject(u) {
    const ok = await confirm(
      'Reject this ID?',
      'They’ll have to upload a new one. Make sure the reason is documented separately.',
    );
    if (!ok) return;
    setBusy(u.id);
    try {
      await setVerificationStatus(u.id, 'rejected');
      await load();
    } catch (e) {
      notify('Could not reject', e?.message || 'Try again.');
    } finally { setBusy(null); }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ResponsiveContainer maxWidth={920}>
        <AnimatedPressable onPress={() => navigation.goBack()} style={styles.back} scaleTo={0.97}>
          <Icon name="back" size={18} color={Colors.green} />
          <Text style={styles.backText}>Back</Text>
        </AnimatedPressable>
        <BrushText variant="screenTitle" style={styles.title}>Verify IDs</BrushText>
        <Text style={styles.subtitle}>
          Review every ID that volunteers and partners upload. Approval unlocks pickup claims.
        </Text>

        {/* Filter pills with counts */}
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
                  {f.label} · {counts[f.key]}
                </Text>
              </AnimatedPressable>
            );
          })}
        </View>

        {members === null ? (
          <View style={styles.center}><ActivityIndicator color={Colors.green} /></View>
        ) : inBucket.length === 0 ? (
          <View style={styles.empty}>
            <Icon name="check-circle" size={26} color={Colors.green} strokeWidth={1.75} />
            <Text style={styles.emptyTitle}>Nothing to review here</Text>
            <Text style={styles.emptyBody}>
              {filter === 'pending'
                ? 'All caught up. New uploads will show up here.'
                : filter === 'approved'
                ? 'No approvals yet.'
                : 'No rejected IDs.'}
            </Text>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            {inBucket.map((u) => (
              <View key={u.id} style={styles.row}>
                <TouchableOpacity
                  onPress={() => setLightbox(u.id_document_url)}
                  style={styles.thumbWrap}
                  accessibilityLabel="Open ID at full size"
                >
                  <Image source={{ uri: u.id_document_url }} style={styles.thumb} resizeMode="cover" />
                </TouchableOpacity>

                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{u.name || u.business_name || '(no name)'}</Text>
                  <Text style={styles.meta}>{u.email}</Text>
                  {u.phone ? <Text style={styles.meta}>{u.phone}</Text> : null}
                  <Text style={styles.meta}>
                    {[u.city, u.state].filter(Boolean).join(', ') || '—'} · role: {u.role || 'member'}
                  </Text>
                  {u.waiver_signed_name ? (
                    <View style={styles.waiverPill}>
                      <Icon name="shield" size={12} color={Colors.green} />
                      <Text style={styles.waiverText}>
                        Waiver signed by {u.waiver_signed_name} · {prettyDate(u.waiver_signed_at)}
                      </Text>
                    </View>
                  ) : (
                    <Text style={[styles.meta, { color: Colors.pink, fontWeight: '700' }]}>No waiver on file</Text>
                  )}
                </View>

                <View style={styles.actions}>
                  {filter !== 'approved' ? (
                    <AnimatedPressable
                      style={[styles.actBtn, styles.approveBtn]}
                      onPress={() => approve(u)}
                      disabled={busy === u.id}
                      scaleTo={0.97}
                    >
                      <Text style={styles.approveText}>{busy === u.id ? '…' : 'Approve'}</Text>
                    </AnimatedPressable>
                  ) : null}
                  {filter !== 'rejected' ? (
                    <AnimatedPressable
                      style={[styles.actBtn, styles.rejectBtn]}
                      onPress={() => reject(u)}
                      disabled={busy === u.id}
                      scaleTo={0.97}
                    >
                      <Text style={styles.rejectText}>Reject</Text>
                    </AnimatedPressable>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        )}
      </ResponsiveContainer>

      {/* Full-screen ID preview */}
      <Modal visible={!!lightbox} transparent animationType="fade" onRequestClose={() => setLightbox(null)}>
        <TouchableOpacity style={styles.lightboxScrim} onPress={() => setLightbox(null)} activeOpacity={1}>
          <Image source={{ uri: lightbox }} style={styles.lightboxImg} resizeMode="contain" />
          <Text style={styles.lightboxHint}>Tap anywhere to close</Text>
        </TouchableOpacity>
      </Modal>
    </ScrollView>
  );
}

function prettyDate(ts) {
  if (!ts) return '—';
  const ms = ts?.toMillis?.() || new Date(ts).getTime();
  if (!ms) return '—';
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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
  title: { color: Colors.green, marginTop: 4 },
  subtitle: { ...Type.body, color: Colors.gray, marginTop: 4, marginBottom: 18 },

  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 22 },
  pill: {
    paddingVertical: 8, paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: Colors.white,
    borderWidth: 1.5, borderColor: Colors.glassBorder,
  },
  pillOn: { backgroundColor: Colors.green, borderColor: Colors.green },
  pillText: { fontSize: 13, fontWeight: '700', color: Colors.dark },
  pillTextOn: { color: Colors.white },

  center: { paddingVertical: 36, alignItems: 'center' },

  empty: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: 26,
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
    ...Shadows.soft,
    borderWidth: 1, borderColor: Colors.glassBorder,
  },
  thumbWrap: {
    width: 110, height: 110, borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: Colors.cream,
  },
  thumb: { width: '100%', height: '100%' },
  name: { fontSize: 15, fontWeight: '800', color: Colors.dark },
  meta: { ...Type.caption, marginTop: 2 },

  waiverPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 99,
    backgroundColor: Colors.greenLight,
  },
  waiverText: { fontSize: 11, fontWeight: '700', color: Colors.green },

  actions: { gap: 8, justifyContent: 'center' },
  actBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, alignItems: 'center' },
  approveBtn: { backgroundColor: Colors.green },
  approveText: { color: Colors.white, fontSize: 13, fontWeight: '800' },
  rejectBtn: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: Colors.pink },
  rejectText: { color: Colors.pink, fontSize: 13, fontWeight: '800' },

  lightboxScrim: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center', justifyContent: 'center',
    padding: 24,
  },
  lightboxImg: { width: '100%', height: '85%' },
  lightboxHint: { color: 'rgba(255,255,255,0.7)', marginTop: 14, fontSize: 13 },
});
