// Settings → Connected accounts.
//
// Lets the signed-in user proactively link / unlink sign-in methods so
// they can use Google AND email/password (and Apple, once enabled).
// Mirror of the standard Linear / Stripe / Vercel pattern.
//
// State machine per row:
//   linked, more than one connected → "Disconnect"
//   linked, only one connected      → "Disconnect" disabled (would lock out)
//   not linked                      → "Connect"
//
// Setting a password works the same way: only show "Set a password" if
// they don't have one yet.
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator, Platform,
} from 'react-native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import ResponsiveContainer from '../../components/ui/ResponsiveContainer';
import AnimatedPressable from '../../components/ui/AnimatedPressable';
import Icon from '../../components/ui/Icon';
import {
  getLinkedProviders,
  linkGoogleToCurrentUser,
  linkAppleToCurrentUser,
  unlinkProvider,
  setPasswordOnCurrentUser,
} from '../../services/auth';
import { notify, notifyThen, confirm } from '../../services/ui';
import { FEATURES } from '../../config/features';

// Map Firebase provider IDs to UI metadata.
const PROVIDERS = [
  {
    id: 'password',
    label: 'Email & password',
    blurb: 'Sign in with your email and the password you set.',
    icon: 'lock',
  },
  {
    id: 'google.com',
    label: 'Google',
    blurb: 'One-tap sign in with your Google account.',
    icon: 'user',
  },
  {
    id: 'apple.com',
    label: 'Apple',
    blurb: 'One-tap sign in with your Apple ID.',
    icon: 'shield',
    gated: 'APPLE_SIGNIN', // hidden when feature flag is off
  },
];

export default function ConnectedAccounts({ navigation }) {
  const [providers, setProviders] = useState(getLinkedProviders());
  const [busy, setBusy] = useState(null); // providerId being processed
  const [showSetPw, setShowSetPw] = useState(false);
  const [pw, setPw] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');

  const refresh = useCallback(() => setProviders(getLinkedProviders()), []);

  useEffect(() => { refresh(); }, [refresh]);

  async function handleConnect(providerId) {
    setBusy(providerId);
    try {
      if (providerId === 'google.com') {
        await linkGoogleToCurrentUser();
        notify('Connected', 'Google is now linked. You can sign in either way.');
      } else if (providerId === 'apple.com') {
        await linkAppleToCurrentUser();
        notify('Connected', 'Apple is now linked. You can sign in either way.');
      } else if (providerId === 'password') {
        setShowSetPw(true);
      }
      refresh();
    } catch (e) {
      notify('Couldn’t connect', e?.message || 'Try again.');
    } finally { setBusy(null); }
  }

  async function handleDisconnect(providerId, label) {
    if (providers.length <= 1) {
      notify('Can’t disconnect', 'This is your only sign-in method. Connect another one first.');
      return;
    }
    const ok = await confirm(
      `Disconnect ${label}?`,
      'You’ll still be able to sign in with your other methods.',
    );
    if (!ok) return;
    setBusy(providerId);
    try {
      await unlinkProvider(providerId);
      refresh();
      notify('Disconnected', `${label} removed from this account.`);
    } catch (e) {
      notify('Couldn’t disconnect', e?.message || 'Try again.');
    } finally { setBusy(null); }
  }

  async function handleSavePassword() {
    if (pw !== pwConfirm) {
      notify('Passwords don’t match', 'Make sure both fields are identical.');
      return;
    }
    setBusy('password');
    try {
      await setPasswordOnCurrentUser(pw);
      setShowSetPw(false); setPw(''); setPwConfirm('');
      refresh();
      notifyThen('Password set', 'You can now sign in with your email and this password too.');
    } catch (e) {
      notify('Couldn’t set password', e?.message || 'Try again.');
    } finally { setBusy(null); }
  }

  const visible = PROVIDERS.filter((p) => !p.gated || FEATURES[p.gated]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ResponsiveContainer maxWidth={620}>
        <AnimatedPressable onPress={() => navigation.goBack()} style={styles.back} scaleTo={0.97}>
          <Icon name="back" size={18} color={Colors.green} />
          <Text style={styles.backText}>Back</Text>
        </AnimatedPressable>
        <BrushText variant="screenTitle" style={styles.title}>Connected accounts</BrushText>
        <Text style={styles.subtitle}>
          Link more than one sign-in method so you can log in whichever way is easiest. We’ll always
          tie them all to the same BetterNature account — your stats, role, and history stay put.
        </Text>

        {visible.map((p) => {
          const linked = providers.includes(p.id);
          return (
            <View key={p.id} style={styles.row}>
              <View style={styles.iconWrap}>
                <Icon name={p.icon} size={20} color={Colors.green} strokeWidth={2.25} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.rowHead}>
                  <Text style={styles.label}>{p.label}</Text>
                  {linked ? (
                    <View style={styles.pill}>
                      <Icon name="check" size={11} color={Colors.green} />
                      <Text style={styles.pillText}>Connected</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.blurb}>{p.blurb}</Text>
                <View style={{ marginTop: 10 }}>
                  {linked ? (
                    <AnimatedPressable
                      onPress={() => handleDisconnect(p.id, p.label)}
                      disabled={busy === p.id || providers.length <= 1}
                      style={[
                        styles.smallBtn,
                        providers.length <= 1 && styles.smallBtnDisabled,
                      ]}
                      scaleTo={0.97}
                    >
                      <Text style={[
                        styles.smallBtnText,
                        providers.length <= 1 && styles.smallBtnTextDisabled,
                      ]}>
                        {providers.length <= 1 ? 'Last method — can’t remove' : 'Disconnect'}
                      </Text>
                    </AnimatedPressable>
                  ) : (
                    <AnimatedPressable
                      onPress={() => handleConnect(p.id)}
                      disabled={busy === p.id}
                      style={[styles.smallBtn, styles.smallBtnPrimary]}
                      scaleTo={0.97}
                    >
                      <Text style={[styles.smallBtnText, { color: Colors.cream }]}>
                        {busy === p.id ? 'Connecting…' : (p.id === 'password' ? 'Set a password' : `Connect ${p.label}`)}
                      </Text>
                    </AnimatedPressable>
                  )}
                </View>
              </View>
            </View>
          );
        })}

        {/* Inline password form — only opens when "Set a password" is tapped */}
        {showSetPw ? (
          <View style={styles.pwCard}>
            <Text style={styles.pwTitle}>Set a password</Text>
            <Text style={styles.pwHelp}>
              We’ll add a password to your account. Use it to sign in with your email going forward.
              Minimum 6 characters.
            </Text>
            <Text style={styles.field}>New password</Text>
            <Input value={pw} onChangeText={setPw} secureTextEntry placeholder="At least 6 characters" />
            <Text style={styles.field}>Confirm</Text>
            <Input value={pwConfirm} onChangeText={setPwConfirm} secureTextEntry placeholder="Type it again" />
            <Button
              title={busy === 'password' ? 'Saving…' : 'Save password'}
              onPress={handleSavePassword}
              loading={busy === 'password'}
              style={{ marginTop: 14 }}
            />
          </View>
        ) : null}

        <Text style={styles.foot}>
          Tip: if you forget which method you originally used, the “Forgot password” email goes to
          whichever email is attached to your account — it works as long as your email is verified.
        </Text>
      </ResponsiveContainer>
    </ScrollView>
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
  title: { color: Colors.green, marginTop: 4 },
  subtitle: { ...Type.body, color: Colors.gray, marginTop: 4, marginBottom: 24 },

  row: {
    flexDirection: 'row', gap: 14,
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1, borderColor: Colors.glassBorder,
    ...Shadows.soft,
  },
  iconWrap: {
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: Colors.greenLight,
    alignItems: 'center', justifyContent: 'center',
  },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontSize: 15, fontWeight: '800', color: Colors.dark, letterSpacing: -0.2 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 99,
    backgroundColor: Colors.greenLight,
  },
  pillText: { fontSize: 11, fontWeight: '700', color: Colors.green },
  blurb: { ...Type.caption, marginTop: 2 },

  smallBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 8, paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1.5, borderColor: Colors.green,
  },
  smallBtnPrimary: { backgroundColor: Colors.green },
  smallBtnDisabled: { borderColor: Colors.grayLight, backgroundColor: Colors.grayFaint },
  smallBtnText: { fontSize: 13, fontWeight: '700', color: Colors.green, letterSpacing: 0.1 },
  smallBtnTextDisabled: { color: Colors.grayMid },

  pwCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: 18,
    marginTop: 6,
    marginBottom: 18,
    borderWidth: 1, borderColor: Colors.glassBorder,
    ...Shadows.soft,
  },
  pwTitle: { fontSize: 15, fontWeight: '800', color: Colors.dark, marginBottom: 4 },
  pwHelp: { ...Type.caption, marginBottom: 12 },
  field: { fontSize: 12, fontWeight: '700', color: Colors.dark, letterSpacing: 0.3, marginTop: 12, marginBottom: 6, textTransform: 'uppercase' },

  foot: { ...Type.caption, color: Colors.gray, marginTop: 14 },
});
