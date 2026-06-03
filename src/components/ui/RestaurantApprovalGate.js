// Gate that blocks the restaurant dashboard until an executive
// flips the partner's status from 'pending' to 'approved' inside
// the app (Manage Restaurants → Pending tab → Approve).
//
// The decision is sourced from two places, in priority order:
//   1) users/{uid}.restaurant_status     (mirrored at signup)
//   2) restaurants/{restaurant_id}.status (source of truth, polled live)
//
// We poll the restaurant doc every 8s so the screen flips to the
// real dashboard the instant the exec approves, without requiring
// the restaurant to sign out and back in.
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from './BrushText';
import Button from './Button';
import useAuthStore from '../../store/authStore';
import { fetchChapterById } from '../../services/database'; // not used; placeholder import keeps tree-shaken
import { doc, getDoc } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../../config/firebase';
import { signOut } from '../../services/auth';

export default function RestaurantApprovalGate({ children }) {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const clearAuth = useAuthStore((s) => s.signOut);
  const [status, setStatus] = useState(user?.restaurant_status || 'pending');
  const [checking, setChecking] = useState(false);

  async function refresh() {
    if (!isFirebaseConfigured) return;
    if (!user?.restaurant_id) return;
    setChecking(true);
    try {
      const snap = await getDoc(doc(db, 'restaurants', user.restaurant_id));
      const next = snap.exists() ? (snap.data().status || 'pending') : 'pending';
      setStatus(next);
      if (next !== user.restaurant_status) {
        setUser({ ...user, restaurant_status: next });
      }
    } catch {}
    setChecking(false);
  }

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 8000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.restaurant_id]);

  if (status === 'approved') return children;

  async function handleSignOut() {
    try { await signOut(); } catch {}
    clearAuth();
  }

  const rejected = status === 'rejected';

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <BrushText variant="screenTitle" style={styles.title}>
          {rejected ? 'Application not accepted' : 'Application pending'}
        </BrushText>
        <Text style={styles.body}>
          {rejected
            ? 'A BetterNature executive reviewed your application and was unable to approve it at this time. Email info@betternatureofficial.org if you believe this is a mistake.'
            : 'Thanks for applying to be a food rescue partner! An executive will review your application inside the app. Your dashboard will unlock automatically the moment you\'re approved.'}
        </Text>

        <View style={styles.statusRow}>
          {checking ? <ActivityIndicator color={Colors.green} /> : null}
          <Text style={styles.status}>
            Status: <Text style={styles.statusValue}>{status}</Text>
          </Text>
        </View>

        {!rejected && (
          <Button title="Check again" onPress={refresh} loading={checking} style={{ marginTop: 18 }} />
        )}
        <TouchableOpacity onPress={handleSignOut} style={styles.signOutBtn}>
          <Text style={styles.signOut}>Sign out</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: {
    width: '100%', maxWidth: 480, backgroundColor: Colors.white, borderRadius: Radius.xl, padding: 26,
    borderWidth: 1, borderColor: Colors.glassBorder, ...Shadows.card,
  },
  title: { color: Colors.green, marginBottom: 6 },
  body: { ...Type.body, color: Colors.gray, lineHeight: 22 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 18 },
  status: { fontSize: 14, color: Colors.dark, fontWeight: '600' },
  statusValue: { color: Colors.pink, textTransform: 'capitalize' },
  signOutBtn: { alignItems: 'center', paddingVertical: 14, marginTop: 6 },
  signOut: { fontSize: 14, color: Colors.pink, fontWeight: '600' },
});
