// Exec approval queue for chapter activity:
//   1. /chapter_applications — new chapter requests from the signup
//      "Start a chapter" screen. Approving materializes a real
//      /chapters/{id} doc with name "BetterNature {City}".
//   2. /chapter_join_requests — existing members asking to switch
//      into or join a chapter. Approving flips users/{uid}.chapter_id
//      and clears the pending fields.
//
// Embedded inside ManageChapters so execs see pending work the
// moment they open the screen.
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import {
  collection, query, where, getDocs, doc, updateDoc, addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import { updateProfile } from '../../services/auth';

export default function ChapterApprovals({ onApproved }) {
  const [apps, setApps] = useState([]);
  const [joins, setJoins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, j] = await Promise.all([
        getDocs(query(collection(db, 'chapter_applications'), where('status', '==', 'pending'))),
        getDocs(query(collection(db, 'chapter_join_requests'), where('status', '==', 'pending'))),
      ]);
      setApps(a.docs.map((d) => ({ id: d.id, ...d.data() })));
      setJoins(j.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.warn('approval queue load failed', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function approveApp(app) {
    setBusy(`app-${app.id}`);
    try {
      // Materialize the real chapter doc. Naming convention enforced:
      // BetterNature <City>.
      await addDoc(collection(db, 'chapters'), {
        name: `BetterNature ${app.city}`,
        city: app.city,
        state: app.state || null,
        country: app.country || null,
        status: 'active',
        member_count: 0,
        founded_at: serverTimestamp(),
        created_at: serverTimestamp(),
      });
      await updateDoc(doc(db, 'chapter_applications', app.id), {
        status: 'approved', approved_at: serverTimestamp(),
      });
      await load();
      onApproved && onApproved();
    } catch (e) {
      Alert.alert('Could not approve', e.message || 'Try again.');
    } finally { setBusy(null); }
  }

  async function denyApp(app) {
    setBusy(`app-${app.id}`);
    try {
      await updateDoc(doc(db, 'chapter_applications', app.id), {
        status: 'denied', denied_at: serverTimestamp(),
      });
      await load();
    } catch (e) {
      Alert.alert('Could not deny', e.message || 'Try again.');
    } finally { setBusy(null); }
  }

  async function approveJoin(req) {
    setBusy(`join-${req.id}`);
    try {
      // Flip the user's actual chapter_id and clear the pending fields.
      await updateProfile(req.user_id, {
        chapter_id: req.to_chapter_id,
        chapter: { id: req.to_chapter_id, name: req.to_chapter_name },
        pending_chapter_id: null,
        pending_chapter_name: null,
        chapter_request_status: 'approved',
      });
      await updateDoc(doc(db, 'chapter_join_requests', req.id), {
        status: 'approved', approved_at: serverTimestamp(),
      });
      await load();
      onApproved && onApproved();
    } catch (e) {
      Alert.alert('Could not approve', e.message || 'Try again.');
    } finally { setBusy(null); }
  }

  async function denyJoin(req) {
    setBusy(`join-${req.id}`);
    try {
      await updateProfile(req.user_id, {
        pending_chapter_id: null,
        pending_chapter_name: null,
        chapter_request_status: 'denied',
      });
      await updateDoc(doc(db, 'chapter_join_requests', req.id), {
        status: 'denied', denied_at: serverTimestamp(),
      });
      await load();
    } catch (e) {
      Alert.alert('Could not deny', e.message || 'Try again.');
    } finally { setBusy(null); }
  }

  if (loading) return null;
  if (apps.length === 0 && joins.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>Pending approvals</Text>

      {apps.map((a) => (
        <View key={a.id} style={styles.card}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>New chapter: BetterNature {a.city}</Text>
            <Text style={styles.cardSub}>
              {[a.state, a.country].filter(Boolean).join(', ')}
              {a.applicant_name ? ` · from ${a.applicant_name}` : ''}
              {a.applicant_email ? ` (${a.applicant_email})` : ''}
            </Text>
          </View>
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.btn, styles.deny]}
              onPress={() => denyApp(a)}
              disabled={busy === `app-${a.id}`}>
              <Text style={styles.denyText}>Deny</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.approve]}
              onPress={() => approveApp(a)}
              disabled={busy === `app-${a.id}`}>
              <Text style={styles.approveText}>Approve</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}

      {joins.map((j) => (
        <View key={j.id} style={styles.card}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>
              {j.kind === 'switch' ? 'Chapter switch' : 'Chapter join'}: {j.to_chapter_name}
            </Text>
            <Text style={styles.cardSub}>
              {j.user_name || j.user_email || j.user_id}
              {j.user_email && j.user_name ? ` (${j.user_email})` : ''}
            </Text>
          </View>
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.btn, styles.deny]}
              onPress={() => denyJoin(j)}
              disabled={busy === `join-${j.id}`}>
              <Text style={styles.denyText}>Deny</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.approve]}
              onPress={() => approveJoin(j)}
              disabled={busy === `join-${j.id}`}>
              <Text style={styles.approveText}>Approve</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 20 },
  heading: { ...Type.h3, color: Colors.dark, marginBottom: 8 },
  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: 14,
    marginBottom: 10,
    // flexWrap so the Approve/Deny action row drops beneath the
    // applicant info instead of stealing horizontal space.
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
    borderLeftWidth: 4,
    borderLeftColor: Colors.pink,
    ...Shadows.card,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: Colors.dark },
  cardSub: { ...Type.caption, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 8 },
  btn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.md },
  approve: { backgroundColor: Colors.green },
  approveText: { color: Colors.white, fontWeight: '700' },
  deny: { backgroundColor: 'transparent', borderWidth: 1, borderColor: Colors.grayLight },
  denyText: { color: Colors.dark, fontWeight: '600' },
});
