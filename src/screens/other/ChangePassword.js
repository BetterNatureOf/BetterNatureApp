// Change password screen. Email/password users re-auth with current password
// then set a new one. OAuth users (Google/Apple) get a "send reset email"
// path instead since they don't have a password to change.
import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { Colors, Type } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import ResponsiveContainer from '../../components/ui/ResponsiveContainer';
import useAuthStore from '../../store/authStore';
import { changePassword, sendResetEmail } from '../../services/auth';
import { notify, notifyThen } from '../../services/ui';

export default function ChangePassword({ navigation }) {
  const user = useAuthStore((s) => s.user);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (next !== confirm) {
      notify('Passwords don’t match', 'Confirm the new password matches.');
      return;
    }
    setSaving(true);
    try {
      await changePassword(current, next);
      notifyThen('Password updated', 'Use your new password next time you sign in.', () => navigation.goBack());
    } catch (e) {
      console.error('ChangePassword failed:', e);
      notify('Could not update', e?.message || 'Try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    if (!user?.email) return;
    try {
      await sendResetEmail(user.email);
      notify('Reset email sent', `Check ${user.email} for a password reset link.`);
    } catch (e) {
      console.error('Reset email failed:', e);
      notify('Could not send', e?.message || 'Try again.');
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
       <ResponsiveContainer maxWidth={560}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
        <BrushText variant="screenTitle" style={styles.title}>Change Password</BrushText>
        <Text style={styles.subtitle}>You’ll stay signed in on this device.</Text>

        <Text style={styles.label}>Current password</Text>
        <Input value={current} onChangeText={setCurrent} placeholder="Current password" secureTextEntry />

        <Text style={styles.label}>New password</Text>
        <Input value={next} onChangeText={setNext} placeholder="At least 6 characters" secureTextEntry />

        <Text style={styles.label}>Confirm new password</Text>
        <Input value={confirm} onChangeText={setConfirm} placeholder="Type it again" secureTextEntry />

        <Button title={saving ? 'Saving…' : 'Update password'} onPress={handleSave} loading={saving} style={{ marginTop: 24 }} />

        <View style={styles.divider} />

        <Text style={styles.helperTitle}>Forgot your current password?</Text>
        <Text style={styles.helper}>
          We’ll email you a reset link. Use this if you signed up with Google or Apple too.
        </Text>
        <TouchableOpacity onPress={handleReset} style={styles.resetBtn}>
          <Text style={styles.resetText}>Send password reset email</Text>
        </TouchableOpacity>
       </ResponsiveContainer>
      </ScrollView>
    </KeyboardAvoidingView>
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
  title: { color: Colors.green },
  subtitle: { ...Type.body, color: Colors.gray, marginTop: 4, marginBottom: 20 },
  label: { fontSize: 13, fontWeight: '700', color: Colors.dark, marginTop: 14, marginBottom: 6 },
  divider: { height: 1, backgroundColor: Colors.grayLight, marginVertical: 28 },
  helperTitle: { fontSize: 14, fontWeight: '700', color: Colors.dark, marginBottom: 4 },
  helper: { ...Type.caption, color: Colors.gray, marginBottom: 12 },
  resetBtn: { alignSelf: 'flex-start', paddingVertical: 8 },
  resetText: { color: Colors.green, fontWeight: '700' },
});
