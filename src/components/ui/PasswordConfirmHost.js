// Mounts once at the app root and hosts the native password-confirm
// modal for iOS/Android. confirmWithPassword() on native emits a
// 'request' event with a resolver; this component subscribes, opens
// the modal, and calls the resolver with true/false when the user
// answers.
//
// Why an event bus and not a ref: confirmWithPassword can be called
// from anywhere (service modules with no React context, deep-nested
// callbacks). A top-level host + module-scoped bus keeps the call
// site imperative like the web branch already is.
import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Modal, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Colors, Type, Radius } from '../../config/theme';
import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { auth, isFirebaseConfigured } from '../../config/firebase';
import { subscribePasswordRequest } from '../../services/passwordConfirm';

async function reauth(password) {
  if (!isFirebaseConfigured) return true;
  const u = auth.currentUser;
  if (!u || !u.email) throw new Error('No signed-in user with an email');
  // Mirror the web branch — accounts without a password provider
  // (Google/Apple-only signins) already re-authenticated recently at
  // the OAuth window, so we treat them as confirmed and never prompt.
  const isPasswordAcct = (u.providerData || []).some((p) => p.providerId === 'password');
  if (!isPasswordAcct) return true;
  const cred = EmailAuthProvider.credential(u.email, password);
  await reauthenticateWithCredential(u, cred);
  return true;
}

export default function PasswordConfirmHost() {
  const [req, setReq] = useState(null); // { title, message, confirmLabel, destructive, resolve }
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    return subscribePasswordRequest((payload) => {
      setPassword('');
      setErr('');
      setBusy(false);
      setReq(payload);
    });
  }, []);

  if (!req) return null;

  function close(ok) {
    const r = req;
    setReq(null);
    setPassword('');
    setErr('');
    r?.resolve?.(ok);
  }

  async function submit() {
    setBusy(true);
    setErr('');
    try {
      await reauth(password);
      close(true);
    } catch (e) {
      const code = e?.code || '';
      setErr(
        code === 'auth/wrong-password' || code === 'auth/invalid-credential'
          ? 'Wrong password — try again.'
          : (e?.message || 'Could not verify password.')
      );
      setBusy(false);
    }
  }

  return (
    <Modal transparent animationType="fade" onRequestClose={() => close(false)} visible>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.card}>
          <Text style={[styles.eyebrow, req.destructive !== false && styles.eyebrowDestructive]}>
            Confirm with password
          </Text>
          <Text style={styles.title}>{req.title}</Text>
          {req.message ? <Text style={styles.body}>{req.message}</Text> : null}

          <Text style={styles.label}>Your password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={(v) => { setPassword(v); if (err) setErr(''); }}
            secureTextEntry
            autoFocus
            textContentType="password"
            autoComplete="password"
            editable={!busy}
            onSubmitEditing={submit}
            returnKeyType="go"
            placeholder="•••••••"
            placeholderTextColor={Colors.grayMid}
          />
          {err ? <Text style={styles.err}>{err}</Text> : null}

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.btn, styles.btnGhost]}
              onPress={() => close(false)}
              disabled={busy}
              activeOpacity={0.85}
            >
              <Text style={styles.btnGhostText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.btn,
                req.destructive !== false ? styles.btnDestructive : styles.btnPrimary,
              ]}
              onPress={submit}
              disabled={busy || !password}
              activeOpacity={0.85}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnPrimaryText}>{req.confirmLabel || 'Confirm'}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,28,21,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: 24,
  },
  eyebrow: {
    fontSize: 11, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase',
    color: Colors.green,
  },
  eyebrowDestructive: { color: '#DB2777' },
  title: { fontSize: 20, fontWeight: '800', color: Colors.dark, marginTop: 4 },
  body: { ...Type.body, color: Colors.gray, marginTop: 8, lineHeight: 20 },
  label: {
    fontSize: 11, fontWeight: '700', color: '#7A766C', letterSpacing: 0.4,
    textTransform: 'uppercase', marginTop: 18, marginBottom: 6,
  },
  input: {
    borderWidth: 1, borderColor: '#E9E4D4', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, backgroundColor: '#FAF8F1', color: Colors.dark,
  },
  err: { color: '#DB2777', fontSize: 12, marginTop: 6 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 18 },
  btn: {
    flex: 1, paddingVertical: 12, borderRadius: 999,
    alignItems: 'center', justifyContent: 'center',
  },
  btnGhost: { borderWidth: 1, borderColor: '#E9E4D4', backgroundColor: Colors.white },
  btnGhostText: { color: Colors.dark, fontWeight: '700', fontSize: 14 },
  btnPrimary: { backgroundColor: Colors.green },
  btnDestructive: { backgroundColor: '#DB2777' },
  btnPrimaryText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
});
