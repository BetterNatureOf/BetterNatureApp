import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Colors, Type, Radius } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import Toggle from '../../components/ui/Toggle';
import BrushDivider from '../../components/ui/BrushDivider';

export default function SettingsScreen({ navigation }) {
  const [pushNotifs, setPushNotifs] = useState(true);
  const [eventReminders, setEventReminders] = useState(true);
  const [pickupAlerts, setPickupAlerts] = useState(true);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
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
        <Toggle value={pushNotifs} onToggle={() => setPushNotifs(!pushNotifs)} />
      </View>

      <View style={styles.settingRow}>
        <View style={styles.settingText}>
          <Text style={styles.settingLabel}>Event Reminders</Text>
          <Text style={styles.settingDesc}>Get reminded before events</Text>
        </View>
        <Toggle value={eventReminders} onToggle={() => setEventReminders(!eventReminders)} />
      </View>

      <View style={styles.settingRow}>
        <View style={styles.settingText}>
          <Text style={styles.settingLabel}>Pickup Alerts</Text>
          <Text style={styles.settingDesc}>Notify when new pickups are available</Text>
        </View>
        <Toggle value={pickupAlerts} onToggle={() => setPickupAlerts(!pickupAlerts)} />
      </View>

      <BrushDivider />

      <BrushText variant="sectionHeader" style={styles.sectionTitle}>
        Account
      </BrushText>

      <Text style={styles.linkItem} onPress={() => {}}>Edit Profile</Text>
      <Text style={styles.linkItem} onPress={() => {}}>Change Password</Text>
      <Text style={styles.linkItem} onPress={() => {}}>Privacy Policy</Text>
      <Text style={styles.linkItem} onPress={() => {}}>Terms of Service</Text>

      <BrushDivider />

      <Text style={styles.version}>Better Nature v1.0.0</Text>
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
