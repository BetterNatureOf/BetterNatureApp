import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, Linking, TouchableOpacity, Alert } from 'react-native';
import { Colors, Type, Radius } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import Toggle from '../../components/ui/Toggle';
import BrushDivider from '../../components/ui/BrushDivider';
import ResponsiveContainer from '../../components/ui/ResponsiveContainer';
import useAuthStore from '../../store/authStore';
import { updateProfile } from '../../services/auth';

export default function SettingsScreen({ navigation }) {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const prefs = user?.notification_prefs || {};
  const [pushNotifs, setPushNotifs] = useState(prefs.push !== false);
  const [eventReminders, setEventReminders] = useState(prefs.events !== false);
  const [pickupAlerts, setPickupAlerts] = useState(prefs.pickups !== false);

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

  function openUrl(url) {
    Linking.openURL(url).catch(() => Alert.alert('Could not open link', url));
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
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
      <TouchableOpacity onPress={() => openUrl('https://betternatureofficial.org/privacy')}>
        <Text style={styles.linkItem}>Privacy Policy</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => openUrl('https://betternatureofficial.org/terms')}>
        <Text style={styles.linkItem}>Terms of Service</Text>
      </TouchableOpacity>

      <BrushDivider />

      <Text style={styles.version}>BetterNature v1.0.0</Text>
     </ResponsiveContainer>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
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
});
