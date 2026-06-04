// "Bring a friend" — every member's referral code, share button, and a
// running count of how many people they've brought in. Plugs into the
// Profile menu. Counts here feed leaderboards later.
import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Share, Platform,
} from 'react-native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';

// No expo-clipboard dep yet — use the Web Clipboard API on web, otherwise
// fall back to Share so the user can pick a destination.
async function copyText(text) {
  if (!text) return false;
  try {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  return false;
}
import BrushText from '../../components/ui/BrushText';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import StatCard from '../../components/ui/StatCard';
import BrushDivider from '../../components/ui/BrushDivider';
import useAuthStore from '../../store/authStore';
import { TextInput } from 'react-native';
import {
  ensureReferralCode, getReferralStats, referralLink, applyReferral,
} from '../../services/referrals';
import Screen from '../../components/ui/Screen';
import { notify } from '../../services/ui';

export default function ReferScreen({ navigation }) {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [code, setCode] = useState(user?.referral_code || null);
  const [count, setCount] = useState(user?.referrals_count || 0);
  const [loading, setLoading] = useState(true);
  // Whether this user has already used someone's code. Once set, the
  // input is locked — referred_by is one-write-only by design (also
  // enforced server-side in applyReferral).
  const [referredBy, setReferredBy] = useState(user?.referred_by || null);
  const [pendingCode, setPendingCode] = useState('');
  const [applying, setApplying] = useState(false);

  async function handleApplyCode() {
    const raw = (pendingCode || '').trim().toUpperCase();
    if (!raw) { notify('Code required', 'Type the referral code your friend gave you.'); return; }
    if (raw === code) { notify('That\'s your own code', 'You can\'t use your own code.'); return; }
    setApplying(true);
    try {
      const result = await applyReferral(user.id, raw);
      if (!result?.ok) {
        notify('Could not apply', result?.reason === 'no_match'
          ? 'No one owns that code. Double-check it with your friend.'
          : result?.reason === 'already_referred'
          ? 'You already used a referral code on this account.'
          : 'Could not apply this code.');
        return;
      }
      setReferredBy(result.inviterId || true);
      setPendingCode('');
      if (setUser) setUser({ ...user, referred_by: result.inviterId || true });
      notify('Code applied', 'Thanks! Your friend just got the credit.');
    } catch (e) {
      notify('Could not apply', e?.message || 'Try again.');
    } finally { setApplying(false); }
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!user?.id) return;
      try {
        // Backfill a code if this account predates the referral feature.
        await ensureReferralCode(user.id);
        const s = await getReferralStats(user.id);
        if (!alive) return;
        setCode(s.code);
        setCount(s.count);
      } catch {} finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [user?.id]);

  const link = code ? referralLink(code) : '';
  const message =
    `Join me on BetterNature — we rescue food, plant trees, and clean waterways. ` +
    `Sign up with my code ${code || ''} and we both get credit.\n${link}`;

  async function handleCopy() {
    const ok = await copyText(code || '');
    if (ok) Alert.alert('Copied', 'Your code is on the clipboard.');
    else handleShare();
  }
  async function handleCopyLink() {
    const ok = await copyText(link);
    if (ok) Alert.alert('Copied', 'Share link is on the clipboard.');
    else handleShare();
  }
  async function handleShare() {
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: 'BetterNature', text: message, url: link });
        return;
      }
      await Share.share({ message, url: link, title: 'BetterNature' });
    } catch {}
  }

  return (
    <Screen contentStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>{'\u2039 Back'}</Text>
        </TouchableOpacity>
        <BrushText variant="screenTitle" style={styles.title}>
          Bring a friend
        </BrushText>
        <Text style={styles.subtitle}>
          Every signup with your code adds to your impact total.
        </Text>
      </View>

      <Card style={styles.codeCard}>
        <Text style={styles.label}>Your referral code</Text>
        <Text style={styles.code}>{loading ? '...' : (code || '—')}</Text>
        <View style={styles.row}>
          <TouchableOpacity style={styles.ghostBtn} onPress={handleCopy} disabled={!code}>
            <Text style={styles.ghostBtnText}>Copy code</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.ghostBtn} onPress={handleCopyLink} disabled={!code}>
            <Text style={styles.ghostBtnText}>Copy link</Text>
          </TouchableOpacity>
        </View>
        <Button title="Share" onPress={handleShare} style={styles.shareBtn} />
      </Card>

      <BrushDivider />

      {/* Post-signup code entry — only visible until the user has used
          one code. After that the input is replaced by a confirmation
          line so the rule (one code per account) is obvious. */}
      <Card style={styles.applyCard}>
        <Text style={styles.applyLabel}>Have a friend's code?</Text>
        {referredBy ? (
          <Text style={styles.applyDone}>You've already used a referral code on this account. ✓</Text>
        ) : (
          <>
            <Text style={styles.applyHelp}>
              You can enter one code on your account — only one, ever. After that, you can only give your code to others.
            </Text>
            <View style={styles.applyRow}>
              <TextInput
                style={styles.applyInput}
                value={pendingCode}
                onChangeText={(v) => setPendingCode(v.toUpperCase())}
                placeholder="e.g. BN7Q9X4K"
                placeholderTextColor={Colors.grayMid}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={16}
              />
              <Button title="Apply" onPress={handleApplyCode} loading={applying} style={{ minWidth: 100 }} />
            </View>
          </>
        )}
      </Card>

      <BrushDivider />

      <View style={styles.statsRow}>
        <StatCard number={count} label="Friends joined" color={Colors.green} style={styles.stat} />
        <StatCard number={code ? '1' : '0'} label="Active link" color={Colors.pink} style={styles.stat} />
      </View>

      <BrushDivider />

      <BrushText variant="sectionHeader" style={styles.how}>
        How it works
      </BrushText>
      <Card style={styles.howCard}>
        <Text style={styles.step}>1. Share your code or link with a friend.</Text>
        <Text style={styles.step}>2. They sign up — code auto-applies from the link.</Text>
        <Text style={styles.step}>3. Their first event credits both of you.</Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
    ...(Platform.OS === 'web' ? { height: '100vh' } : null),
  },
  content: { paddingBottom: 40 },
  header: { padding: 24, paddingTop: 60, backgroundColor: Colors.greenLight },
  back: { fontSize: 16, color: Colors.green, marginBottom: 8 },
  title: { color: Colors.green, fontSize: 36 },
  subtitle: { ...Type.body, color: Colors.gray, marginTop: 6, lineHeight: 22 },
  codeCard: { marginHorizontal: 24, marginTop: 20, alignItems: 'center', padding: 24 },
  label: { ...Type.caption, color: Colors.gray, marginBottom: 6 },
  code: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: 4,
    color: Colors.green,
    marginBottom: 18,
  },
  row: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  ghostBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    backgroundColor: Colors.white,
  },
  ghostBtnText: { fontSize: 13, fontWeight: '600', color: Colors.dark },
  shareBtn: { marginTop: 4, alignSelf: 'stretch' },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    gap: 10,
  },
  stat: { flex: 1 },
  how: { color: Colors.green, paddingHorizontal: 24, marginBottom: 12 },
  howCard: { marginHorizontal: 24, padding: 18 },
  step: { ...Type.body, color: Colors.dark, marginBottom: 8, lineHeight: 22 },
  applyCard: { marginHorizontal: 24, marginVertical: 16, padding: 16 },
  applyLabel: { fontSize: 14, fontWeight: '800', color: Colors.green },
  applyHelp: { ...Type.caption, color: Colors.gray, marginTop: 6, lineHeight: 18 },
  applyDone: { ...Type.caption, color: Colors.green, marginTop: 6, fontWeight: '700' },
  applyRow: { flexDirection: 'row', gap: 8, marginTop: 10, alignItems: 'stretch' },
  applyInput: {
    flex: 1, borderWidth: 1, borderColor: Colors.glassBorder, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, fontWeight: '700',
    letterSpacing: 1.4, color: Colors.green, backgroundColor: '#FAF8F1',
  },
});
