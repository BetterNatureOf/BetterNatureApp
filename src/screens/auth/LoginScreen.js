import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Type, Radius } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import ResponsiveContainer from '../../components/ui/ResponsiveContainer';
import { signIn } from '../../services/auth';
import { isSupabaseConfigured } from '../../config/supabase';
import useAuthStore, { ROLES } from '../../store/authStore';

function inferRoleFromEmail(email) {
  const lower = email.trim().toLowerCase();
  if (lower.startsWith('exec@') || lower.startsWith('csuite@')) return ROLES.EXECUTIVE;
  if (lower.startsWith('president@') || lower.startsWith('pres@')) return ROLES.PRESIDENT;
  if (lower.startsWith('restaurant@') || lower.startsWith('rest@')) return ROLES.RESTAURANT;
  return ROLES.MEMBER;
}

function nameFromRole(role) {
  switch (role) {
    case ROLES.EXECUTIVE:
      return 'Alex Chen';
    case ROLES.PRESIDENT:
      return 'Jordan Rivers';
    case ROLES.RESTAURANT:
      return 'Local Bistro';
    default:
      return 'Demo Member';
  }
}

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
      const demoRole = isSupabaseConfigured ? undefined : inferRoleFromEmail(email);
      const result = await signIn({ email, password, role: demoRole });
      const user = result?.user
        ? {
            ...result.user,
            role: result.user.role || demoRole || ROLES.MEMBER,
            name:
              result.user.name && result.user.name !== 'Demo User' && result.user.name !== ''
                ? result.user.name
                : nameFromRole(result.user.role || demoRole),
            chapter_id: result.user.chapter_id || 'ch-memphis',
          }
        : null;
      if (user) setUser(user);
    } catch (e) {
      Alert.alert('Login Failed', e.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  }

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

          <Text style={styles.signupLink} onPress={() => navigation.navigate('SignupStep1')}>
            Don't have an account? <Text style={styles.signupBold}>Sign up</Text>
          </Text>

          <View style={styles.demoBox}>
            <LinearGradient
              colors={Colors.gradient.green}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.demoHeader}
            >
              <Text style={styles.demoTitle}>Demo logins</Text>
            </LinearGradient>
            <View style={styles.demoBody}>
              <View style={styles.demoRow}>
                <View style={[styles.demoDot, { backgroundColor: Colors.sage }]} />
                <Text style={styles.demoLine}>
                  <Text style={styles.demoLabel}>Restaurant: </Text>restaurant@demo.com
                </Text>
              </View>
              <View style={styles.demoRow}>
                <View style={[styles.demoDot, { backgroundColor: Colors.green }]} />
                <Text style={styles.demoLine}>
                  <Text style={styles.demoLabel}>Chapter President: </Text>president@demo.com
                </Text>
              </View>
              <View style={styles.demoRow}>
                <View style={[styles.demoDot, { backgroundColor: Colors.pink }]} />
                <Text style={styles.demoLine}>
                  <Text style={styles.demoLabel}>Executive: </Text>exec@demo.com
                </Text>
              </View>
              <Text style={styles.demoCaption}>Any password works in demo mode.</Text>
            </View>
          </View>
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
  signupLink: { textAlign: 'center', marginTop: 20, ...Type.caption },
  signupBold: { color: Colors.pink, fontWeight: '600' },
  demoBox: {
    marginTop: 32,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  demoHeader: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  demoTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.white,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  demoBody: {
    padding: 16,
    backgroundColor: Colors.white,
  },
  demoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  demoDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  demoLine: { fontSize: 13, color: Colors.dark },
  demoLabel: { fontWeight: '700', color: Colors.green },
  demoCaption: { fontSize: 11, color: Colors.gray, marginTop: 8, fontStyle: 'italic' },
});
