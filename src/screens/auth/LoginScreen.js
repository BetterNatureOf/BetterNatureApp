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
import { signIn } from '../../services/auth';
import { signInWithGoogle } from '../../services/authFirebase';
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
      const user = result?.user
        ? { ...result.user, role: result.user.role || ROLES.MEMBER }
        : null;
      if (user) setUser(user);
    } catch (e) {
      Alert.alert('Login Failed', e.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setLoading(true);
    try {
      const { user } = await signInWithGoogle();
      if (user) setUser({ ...user, role: user.role || ROLES.MEMBER });
    } catch (e) {
      Alert.alert('Google sign in failed', e.message || 'Try again.');
    } finally {
      setLoading(false);
    }
  }

  // Google popup auth only works on web. Native needs expo-auth-session
  // (a separate, larger setup) — surface the button only where it works.
  const showGoogle = Platform.OS === 'web' && isFirebaseConfigured;

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

          {showGoogle && (
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
  container: { flex: 1, backgroundColor: Colors.cream },
  content: { padding: 24, paddingTop: 80, paddingBottom: 60 },
  title: { color: Colors.green },
  subtitle: { ...Type.body, color: Colors.gray, marginTop: 4, marginBottom: 32 },
  btn: { marginTop: 8 },
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
});
