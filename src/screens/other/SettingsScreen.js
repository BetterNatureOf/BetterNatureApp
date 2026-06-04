import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, Linking, TouchableOpacity, Alert, Platform } from 'react-native';
import { Colors, Type, Radius } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import Toggle from '../../components/ui/Toggle';
import BrushDivider from '../../components/ui/BrushDivider';
import ResponsiveContainer from '../../components/ui/ResponsiveContainer';
import useAuthStore from '../../store/authStore';
import { updateProfile, deleteAccount, getProfile } from '../../services/auth';
import { selfPromoteToExecutive, isFounderEmail } from '../../services/founder';
import { notify, confirm } from '../../services/ui';
import Screen from '../../components/ui/Screen';

export default function SettingsScreen({ navigation }) {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const prefs = user?.notification_prefs || {};
  const [pushNotifs, setPushNotifs] = useState(prefs.push !== false);
  const [eventReminders, setEventReminders] = useState(prefs.events !== false);
  const [pickupAlerts, setPickupAlerts] = useState(prefs.pickups !== false);
  const [smsAlerts, setSmsAlerts] = useState(user?.sms_consent !== false);
  const clearAuth = useAuthStore((s) => s.signOut);

  // Persist any toggle change to users/{uid}.notification_prefs. Best-effort —
  // if the user is offline we still update local state immediately.
  async function persistPrefs(next) {
    if (!user?.id) return;
    try {
      await updateProfile(user.id, { notification_prefs: next });
      if (setUser) setUser({ ...user, notification_prefs: next });
    } catch {}
  }

  function togglePush() {
    const v = !pushNotifs; setPushNotifs(v);
    persistPrefs({ push: v, events: eventReminders, pickups: pickupAlerts });
  }
  function toggleEvents() {
    const v = !eventReminders; setEventReminders(v);
    persistPrefs({ push: pushNotifs, events: v, pickups: pickupAlerts });
  }
  function togglePickups() {
    const v = !pickupAlerts; setPickupAlerts(v);
    persistPrefs({ push: pushNotifs, events: eventReminders, pickups: v });
  }
  async function toggleSms() {
    const v = !smsAlerts;
    // Turning SMS off is a heavy decision — it disables the channel
    // BetterNature uses for pickup/event/safety dispatch. Confirm.
    if (!v) {
      const ok = await confirm(
        'Pause text alerts?',
        'You won\'t get pickup alerts, event reminders, or safety dispatch by text. You can re-enable any time.'
      );
      if (!ok) return;
    }
    setSmsAlerts(v);
    if (!user?.id) return;
    try {
      await updateProfile(user.id, { sms_consent: v, sms_consent_changed_at: new Date().toISOString() });
      if (setUser) setUser({ ...user, sms_consent: v });
    } catch {}
  }

  // Two-step delete: first confirm "are you sure", then a final
  // "this will erase your progress" before the actual delete fires.
  async function handleBecomeExecutive() {
    const ok = await confirm(
      'Become executive?',
      'This gives your account org-wide privileges (create chapters, approve partners, edit anyone\'s role). Only do this if you\'re a BetterNature founder or were told to.'
    );
    if (!ok) return;
    try {
      await selfPromoteToExecutive(user.id);
      // Pull a fresh profile so the new role is reflected immediately.
      const fresh = await getProfile(user.id);
      if (fresh && setUser) setUser(fresh);
      notify('Done', "You're now an executive. Open the Org tab to manage chapters.");
    } catch (e) {
      notify('Could not upgrade', e?.message || 'Try again.');
    }
  }

  async function handleDeleteAccount() {
    const ok = await confirm(
      'ARE YOU SURE?',
      'Deleting your account removes your profile, history, and signed agreements. This cannot be undone.'
    );
    if (!ok) return;
    const reallyOk = await confirm(
      'DELETE YOUR ACCOUNT AND PROGRESS?',
      'Last chance. Tap OK to permanently delete your BetterNature account.'
    );
    if (!reallyOk) return;
    try {
      await deleteAccount();
      clearAuth();
    } catch (e) {
      if (String(e?.code || e?.message || '').includes('requires-recent-login')) {
        notify('Please sign in again', 'For security, sign out and sign back in, then try deleting your account again.');
      } else {
        notify('Could not delete', e?.message || 'Try again in a moment.');
      }
    }
  }

  function openUrl(url) {
    Linking.openURL(url).catch(() => Alert.alert('Could not open link', url));
  }

  return (
    <Screen contentStyle={styles.content}>
     <ResponsiveContainer maxWidth={720}>
      <Text style={styles.back} onPress={() => navigation.goBack()}>‹ Back</Text>

      <BrushText variant="screenTitle" style={styles.title}>
        Settings
      </BrushText>

      <BrushText variant="sectionHeader" style={styles.sectionTitle}>
        Notifications
      </BrushText>

      <View style={styles.settingRow}>
        <View style={styles.settingText}>
          <Text style={styles.settingLabel}>Push Notifications</Text>
          <Text style={styles.settingDesc}>Receive alerts on your device</Text>
        </View>
        <Toggle value={pushNotifs} onToggle={togglePush} />
      </View>

      <View style={styles.settingRow}>
        <View style={styles.settingText}>
          <Text style={styles.settingLabel}>Event Reminders</Text>
          <Text style={styles.settingDesc}>Get reminded before events</Text>
        </View>
        <Toggle value={eventReminders} onToggle={toggleEvents} />
      </View>

      <View style={styles.settingRow}>
        <View style={styles.settingText}>
          <Text style={styles.settingLabel}>Pickup Alerts</Text>
          <Text style={styles.settingDesc}>Notify when new pickups are available</Text>
        </View>
        <Toggle value={pickupAlerts} onToggle={togglePickups} />
      </View>

      <BrushDivider />

      <BrushText variant="sectionHeader" style={styles.sectionTitle}>
        Account
      </BrushText>

      <TouchableOpacity onPress={() => navigation.navigate('EditProfile')}>
        <Text style={styles.linkItem}>Edit Profile</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => navigation.navigate('ChangePassword')}>
        <Text style={styles.linkItem}>Change Password</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => navigation.navigate('ConnectedAccounts')}>
        <Text style={styles.linkItem}>Connected accounts (Google, Apple, email)</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => navigation.navigate('MyContracts')}>
        <Text style={styles.linkItem}>Your signed agreements</Text>
      </TouchableOpacity>

      {/* Founder-only role switcher. Explicit allowlist — no
          @betternatureofficial.org domain wildcard, because most
          BetterNature staff will get that email too. Lets the
          founder hop between roles for testing or demote themselves
          to chapter president etc. when stepping back. */}
      {isFounderEmail(user?.email) ? (
        <View style={styles.execCard}>
          <Text style={styles.execBtnTitle}>Founder role switcher</Text>
          <Text style={styles.execBtnHelp}>
            Your current role is <Text style={{ fontWeight: '800' }}>{user?.role || 'member'}</Text>.
            Switch to any role below. Only your account is allowed to do this — Firestore rules block it for everyone else.
          </Text>
          <View style={styles.roleSwitchRow}>
            {['member', 'chapter_president', 'executive'].map((r) => (
              <TouchableOpacity
                key={r}
                style={[styles.roleChip, user?.role === r && styles.roleChipActive]}
                onPress={async () => {
                  if (user?.role === r) return;
                  const ok = await confirm('Switch role?', `Set your role to ${r}?`);
                  if (!ok) return;
                  try {
                    await updateProfile(user.id, { role: r });
                    if (setUser) setUser({ ...user, role: r });
                    notify('Role updated', `You're now a ${r}.`);
                  } catch (e) {
                    notify('Could not switch', e?.message || 'Try again.');
                  }
                }}
              >
                <Text style={[styles.roleChipText, user?.role === r && styles.roleChipTextActive]}>
                  {r.replace('_', ' ')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : null}
      <TouchableOpacity onPress={() => openUrl('https://betternatureofficial.org/privacy')}>
        <Text style={styles.linkItem}>Privacy Policy</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => openUrl('https://betternatureofficial.org/terms')}>
        <Text style={styles.linkItem}>Terms of Service</Text>
      </TouchableOpacity>

      <BrushDivider />

      <TouchableOpacity onPress={handleDeleteAccount} style={styles.deleteBtn}>
        <Text style={styles.deleteText}>Delete my account</Text>
      </TouchableOpacity>

      <Text style={styles.version}>BetterNature v1.0.0</Text>
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
  content: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  back: { fontSize: 16, color: Colors.green, marginBottom: 8 },
  title: { color: Colors.green, marginBottom: 20 },
  sectionTitle: { color: Colors.green, marginBottom: 12 },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.grayLight,
  },
  settingText: { flex: 1, marginRight: 16 },
  settingLabel: { fontSize: 15, fontWeight: '500', color: Colors.dark },
  settingDesc: { ...Type.caption, marginTop: 2 },
  linkItem: {
    fontSize: 15,
    color: Colors.dark,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.grayLight,
  },
  version: { ...Type.caption, textAlign: 'center', marginTop: 16 },
  execBtn: {
    marginTop: 12, marginBottom: 4,
    padding: 14,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.green,
    backgroundColor: '#E8F5EE',
  },
  execBtnTitle: { fontSize: 15, fontWeight: '800', color: Colors.green },
  execBtnHelp: { ...Type.caption, color: Colors.gray, marginTop: 4 },
  execCard: {
    marginTop: 12, marginBottom: 4,
    padding: 14,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.green,
    backgroundColor: '#E8F5EE',
  },
  roleSwitchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  roleChip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: Colors.green, backgroundColor: '#FFFFFF' },
  roleChipActive: { backgroundColor: Colors.green },
  roleChipText: { fontSize: 12, fontWeight: '700', color: Colors.green, textTransform: 'capitalize' },
  roleChipTextActive: { color: '#FFF' },
  deleteBtn: {
    alignItems: 'center',
    paddingVertical: 16,
    marginTop: 8,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  deleteText: { fontSize: 15, color: '#EF4444', fontWeight: '700' },
});
