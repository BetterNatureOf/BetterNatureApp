// Gate that blocks the member dashboard until an executive
// approves the volunteer in Manage Members. Mirrors the
// restaurant approval flow.
//
// Bypass rules (gate is invisible if any are true):
//   - user role isn't 'member' (execs, presidents, restaurants pass through)
//   - user.member_status === 'approved'
//   - user.member_status is missing entirely (legacy accounts seeded
//     before this gate existed are grandfathered in)
//
// Polls users/{uid}.member_status every 8s so the screen flips
// to the dashboard the instant the exec taps Approve.
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from './BrushText';
import Button from './Button';
import useAuthStore from '../../store/authStore';
import { doc, getDoc } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../../config/firebase';
import { signOut } from '../../services/auth';

function shouldBypass(user) {
  if (!user) return true; // not signed in — let auth navigator handle
  const role = (user.role || 'member').toLowerCase();
  if (role !== 'member') return true;
  // Legacy accounts (created before the gate) have no member_status.
  // Treat the absence of the field as 'approved' so we don't lock
  // existing volunteers out.
  if (user.member_status == null) return true;
  return user.member_status === 'approved';
}

export default function MemberApprovalGate({ children }) {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const clearAuth = useAuthStore((s) => s.signOut);
  const [status, setStatus] = useState(user?.member_status || 'approved');
  const [checking, setChecking] = useState(false);

  async function refresh() {
    if (!isFirebaseConfigured || !user?.id) return;
    setChecking(true);
    try {
      const snap = await getDoc(doc(db, 'users', user.id));
      const next = snap.exists() ? (snap.data().member_status ?? 'approved') : 'approved';
      setStatus(next);
      if (next !== user.member_status) {
        setUser({ ...user, member_status: next });
      }
    } catch {}
    setChecking(false);
  }

  useEffect(() => {
    if (shouldBypass(user)) return;
    refresh();
    const t = setInterval(refresh, 8000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.role]);

  if (shouldBypass({ ...user, member_status: status })) return children;

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
            : "Thanks for joining BetterNature! An executive will review your application. Your dashboard will unlock automatically the moment you're approved."}
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
