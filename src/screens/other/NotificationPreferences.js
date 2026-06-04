// Notification Preferences — user-facing toggle screen.
//
// Lets the volunteer / president / restaurant:
//   - edit the email we use for receipts + alerts
//   - turn three notification categories on/off:
//       Volunteer alerts, Pickup alerts, General updates
//   - enable browser push notifications with one tap (OneSignal)
//
// Writes straight to users/{uid}. The dispatcher Worker reads these
// fields when deciding which channels to fan out per notification.
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import ResponsiveContainer from '../../components/ui/ResponsiveContainer';
import Screen from '../../components/ui/Screen';
import Toggle from '../../components/ui/Toggle';
import Button from '../../components/ui/Button';
import useAuthStore from '../../store/authStore';
import { updateProfile, getProfile } from '../../services/auth';
import { notify } from '../../services/ui';
import { requestPush, disablePush } from '../../services/onesignal';

export default function NotificationPreferences({ navigation }) {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [email, setEmail] = useState(user?.email || '');
  const [prefs, setPrefs] = useState({
    notif_volunteer: true,
    notif_pickup: true,
    notif_general: true,
    email_consent: true,
    push_enabled: false,
  });
  const [busy, setBusy] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  const sync = useCallback(async () => {
    if (!user?.id) return;
    try {
      const p = await getProfile(user.id);
      if (!p) return;
      setEmail(p.email || '');
      setPrefs({
        notif_volunteer: p.notif_volunteer !== false,
        notif_pickup:    p.notif_pickup    !== false,
        notif_general:   p.notif_general   !== false,
        email_consent:   p.email_consent   !== false,
        push_enabled:    p.push_enabled    === true,
      });
    } catch {}
  }, [user?.id]);
  useEffect(() => { sync(); }, [sync]);
  useFocusEffect(useCallback(() => { sync(); }, [sync]));

  async function persist(next) {
    if (!user?.id) return;
    setBusy(true);
    try {
      await updateProfile(user.id, next);
      if (setUser) setUser({ ...user, ...next });
    } catch (e) {
      notify('Could not save', e?.message || 'Try again.');
    } finally { setBusy(false); }
  }

  function togglePref(key) {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    persist({ [key]: next[key] });
  }

  async function saveEmail() {
    const e = (email || '').trim().toLowerCase();
    if (!/\S+@\S+\.\S+/.test(e)) {
      notify('Bad email', 'Enter a valid email so we can send receipts and important alerts.');
      return;
    }
    await persist({ email: e });
    notify('Saved', 'Your email is up to date.');
  }

  async function togglePushEnabled() {
    if (Platform.OS !== 'web') {
      notify('Mobile push coming soon', 'For now, push notifications work on the web app.');
      return;
    }
    setPushBusy(true);
    try {
      if (prefs.push_enabled) {
        await disablePush(user.id);
        setPrefs((p) => ({ ...p, push_enabled: false }));
        if (setUser) setUser({ ...user, push_enabled: false, onesignal_player_id: null });
        notify('Push disabled', "You won't get browser notifications.");
      } else {
        const id = await requestPush(user.id);
        setPrefs((p) => ({ ...p, push_enabled: true }));
        if (setUser) setUser({ ...user, push_enabled: true, onesignal_player_id: id });
        notify('Push enabled', 'BetterNature will notify you in this browser.');
      }
    } catch (e) {
      notify('Push not available', e?.message || 'Your browser may have blocked the prompt. Check site settings and try again.');
    } finally { setPushBusy(false); }
  }

  return (
    <Screen contentStyle={styles.content}>
      <ResponsiveContainer maxWidth={680}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
        <BrushText variant="screenTitle" style={styles.title}>Notification preferences</BrushText>
        <Text style={styles.subtitle}>
          Choose how BetterNature reaches you. Changes save instantly.
        </Text>

        {/* Email */}
        <View style={styles.card}>
          <Text style={styles.label}>Email</Text>
          <Text style={styles.help}>Used for receipts and the categories you've opted into below.</Text>
          <View style={styles.emailRow}>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Button title="Save" onPress={saveEmail} loading={busy} style={{ minWidth: 90 }} />
          </View>
        </View>

        {/* Web push — temporarily disabled. We'll bring this back
            once OneSignal is wired through the build properly. */}
        <View style={styles.card}>
          <Text style={styles.label}>Browser push notifications</Text>
          <Text style={styles.help}>
            Coming soon. For now, email + in-app notifications cover the same alerts.
          </Text>
        </View>

        {/* Categories */}
        <View style={styles.card}>
          <Text style={styles.label}>What do you want to hear about?</Text>
          {[
            { key: 'notif_volunteer', title: 'Volunteer alerts',  desc: 'New events, check-ins, badge milestones' },
            { key: 'notif_pickup',    title: 'Food pickup alerts', desc: 'New rescues posted near you, claim reminders' },
            { key: 'notif_general',   title: 'General updates',   desc: 'Org news, broadcasts, monthly impact recap' },
          ].map((row) => (
            <View key={row.key} style={styles.prefRow}>
              <View style={{ flex: 1, paddingRight: 14 }}>
                <Text style={styles.prefTitle}>{row.title}</Text>
                <Text style={styles.prefDesc}>{row.desc}</Text>
              </View>
              <Toggle value={prefs[row.key]} onToggle={() => togglePref(row.key)} />
            </View>
          ))}
          <View style={[styles.prefRow, { borderBottomWidth: 0 }]}>
            <View style={{ flex: 1, paddingRight: 14 }}>
              <Text style={styles.prefTitle}>Allow email at all</Text>
              <Text style={styles.prefDesc}>Master switch for every email. Off = no email regardless of categories above.</Text>
            </View>
            <Toggle value={prefs.email_consent} onToggle={() => togglePref('email_consent')} />
          </View>
        </View>
      </ResponsiveContainer>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream, ...(Platform.OS === 'web' ? { height: '100vh' } : null) },
  content: { padding: 24, paddingTop: 60, paddingBottom: 60 },
  back: { fontSize: 16, color: Colors.green, marginBottom: 8 },
  title: { color: Colors.green, marginBottom: 4 },
  subtitle: { ...Type.body, color: Colors.gray, marginBottom: 20 },
  card: { backgroundColor: Colors.white, borderRadius: Radius.xl, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: Colors.glassBorder, ...Shadows.card },
  label: { fontSize: 12, fontWeight: '800', color: Colors.green, marginBottom: 4, letterSpacing: 0.4, textTransform: 'uppercase' },
  help: { ...Type.caption, marginBottom: 12, color: Colors.gray, lineHeight: 18 },
  input: { flex: 1, borderWidth: 1, borderColor: Colors.glassBorder, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: Colors.dark, backgroundColor: '#FAF8F1' },
  emailRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  pushBtn: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: Colors.green, backgroundColor: Colors.green, alignItems: 'center' },
  pushBtnOn: { backgroundColor: '#E8F5EE' },
  pushBtnText: { color: '#FFF', fontWeight: '800', fontSize: 14 },
  pushBtnTextOn: { color: Colors.green },
  prefRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.grayLight },
  prefTitle: { fontSize: 14, fontWeight: '700', color: Colors.dark },
  prefDesc: { ...Type.caption, marginTop: 2 },
});
