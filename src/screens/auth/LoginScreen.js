import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { Colors, Type, Radius } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import ResponsiveContainer from '../../components/ui/ResponsiveContainer';
import { signIn, sendResetEmail } from '../../services/auth';
import { signInWithGoogle, signInWithApple, linkPendingCredential } from '../../services/authFirebase';
import { FEATURES } from '../../config/features';
import { notify, confirm } from '../../services/ui';
import { isFirebaseConfigured } from '../../config/firebase';
import useAuthStore, { ROLES } from '../../store/authStore';

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const setUser = useAuthStore((s) => s.setUser);

  async function handleLogin() {
    if (!email.trim() || !password) {
      Alert.alert('Required', 'Please enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      const result = await signIn({ email, password });
      // If a Google/Apple credential is sitting in pendingLink (because
      // OAuth landed on this same email earlier), link it now so future
      // OAuth signins resolve to this same account.
      if (pendingLink?.pending) {
        try {
          await linkPendingCredential(pendingLink.pending);
          notify('Accounts linked', 'Your Google/Apple sign-in is now connected to this account.');
        } catch (e) { console.warn('link pending after password signin', e); }
        setPendingLink(null);
      }
      const user = result?.user
        ? { ...result.user, role: result.user.role || ROLES.MEMBER }
        : null;
      if (user) setUser(user);
    } catch (e) {
      notify('Login Failed', e?.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  }

  // A pending OAuth credential we couldn't use immediately because the
  // email already had an account with a different provider. We stash it
  // here and surface a prompt — once the user signs in with the original
  // provider, we link the pending credential onto their now-authed user.
  const [pendingLink, setPendingLink] = useState(null);

  async function handleOAuthResult(promise, label) {
    setLoading(true);
    try {
      const { user } = await promise;
      // If we had a pending credential from a previous attempt, complete
      // the link now. After this, both providers point at one account.
      if (pendingLink?.pending) {
        try {
          await linkPendingCredential(pendingLink.pending);
          notify('Accounts linked', `Your ${label} sign-in is now connected to this account.`);
        } catch (e) { console.warn('link pending failed', e); }
        setPendingLink(null);
      }
      if (user) setUser({ ...user, role: user.role || ROLES.MEMBER });
    } catch (e) {
      if (e?.linking) {
        // Hold the pending credential and tell the user what to do.
        setPendingLink(e.linking);
        const ok = await confirm(
          'Use your existing account?',
          `This email is already signed up with ${e.linking.human}. ` +
          `Sign in with ${e.linking.human}, and we’ll link ${label} to the same account so you only have one login.`
        );
        // The user confirms; the next signin attempt will do the link.
        if (!ok) setPendingLink(null);
      } else {
        notify(`${label} sign in failed`, e?.message || 'Try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    const target = (email || '').trim();
    if (!target) {
      notify('Enter your email', 'Type the email you signed up with above, then tap "Forgot password?" again.');
      return;
    }
    try {
      await sendResetEmail(target);
      notify('Check your email', `We sent a password reset link to ${target}. It may take a minute to arrive.`);
    } catch (e) {
      notify('Could not send', e?.message || 'Try again in a moment.');
    }
  }

  function handleGoogle() { return handleOAuthResult(signInWithGoogle(), 'Google'); }
  function handleApple()  { return handleOAuthResult(signInWithApple(),  'Apple'); }

  // Popup auth only works on web. Native needs expo-auth-session
  // (a separate, larger setup) — surface the buttons only where they work.
  const showOAuth = Platform.OS === 'web' && isFirebaseConfigured;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <ResponsiveContainer maxWidth={460}>
          <BrushText variant="screenTitle" style={styles.title}>
            Welcome Back
          </BrushText>
          <Text style={styles.subtitle}>Sign in to your account</Text>

          <Input
            label="Email"
            placeholder="you@email.com"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <Input
            label="Password"
            placeholder="Your password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <Button
            title="Sign In"
            onPress={handleLogin}
            loading={loading}
            style={styles.btn}
          />

          <TouchableOpacity onPress={handleForgotPassword} style={styles.forgotBtn}>
            <Text style={styles.forgotText}>Forgot password?</Text>
          </TouchableOpacity>

          {showOAuth && (
            <>
              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.dividerLine} />
              </View>
              <TouchableOpacity
                style={styles.googleBtn}
                onPress={handleGoogle}
                disabled={loading}
                activeOpacity={0.85}
              >
                <Text style={styles.googleG}>G</Text>
                <Text style={styles.googleText}>Continue with Google</Text>
              </TouchableOpacity>
              {/* Apple sign-in is gated on FEATURES.APPLE_SIGNIN.
                  Until you (a) join the Apple Developer Program,
                  (b) create a Services ID, (c) enable Apple in Firebase
                  Console → Authentication → Sign-in method, and
                  (d) set EXPO_PUBLIC_APPLE_SIGNIN_ENABLED=true in your
                  Cloudflare env, the button stays hidden. Exposing a
                  broken auth path is worse than not exposing one. */}
              {FEATURES.APPLE_SIGNIN ? (
                <TouchableOpacity
                  style={styles.appleBtn}
                  onPress={handleApple}
                  disabled={loading}
                  activeOpacity={0.85}
                >
                  <Text style={styles.appleLogo}></Text>
                  <Text style={styles.appleText}>Continue with Apple</Text>
                </TouchableOpacity>
              ) : null}
            </>
          )}

          <Text style={styles.signupLink} onPress={() => navigation.navigate('SignupStep1')}>
            Don't have an account? <Text style={styles.signupBold}>Sign up</Text>
          </Text>
        </ResponsiveContainer>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
    ...(Platform.OS === 'web' ? { height: '100vh' } : null),
  },
  content: { padding: 24, paddingTop: 80, paddingBottom: 60 },
  title: { color: Colors.green },
  subtitle: { ...Type.body, color: Colors.gray, marginTop: 4, marginBottom: 32 },
  btn: { marginTop: 8 },
  forgotBtn: { alignSelf: 'center', paddingVertical: 12, marginTop: 4 },
  forgotText: { color: Colors.green, fontSize: 14, fontWeight: '600' },
  signupLink: { textAlign: 'center', marginTop: 24, ...Type.caption },
  signupBold: { color: Colors.pink, fontWeight: '600' },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
    gap: 10,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.glassBorder },
  dividerText: { fontSize: 12, color: Colors.gray },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    backgroundColor: Colors.white,
  },
  googleG: {
    fontSize: 18,
    fontWeight: '700',
    color: '#4285F4',
  },
  googleText: {
    fontSize: 15,
    color: Colors.dark,
    fontWeight: '600',
  },
  appleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    borderRadius: Radius.lg,
    backgroundColor: '#000',
    marginTop: 10,
  },
  appleLogo: {
    fontSize: 18,
    color: '#fff',
  },
  appleText: {
    fontSize: 15,
    color: '#fff',
    fontWeight: '600',
  },
});
