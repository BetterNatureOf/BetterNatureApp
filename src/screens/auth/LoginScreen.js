import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
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
import { signIn, sendResetEmail } from '../../services/auth';
import { signInWithGoogle, signInWithApple, linkPendingCredential } from '../../services/authFirebase';
import { FEATURES } from '../../config/features';
import { notify, confirm } from '../../services/ui';
import { isFirebaseConfigured } from '../../config/firebase';
import useAuthStore, { ROLES } from '../../store/authStore';
import useBreakpoint from '../../hooks/useBreakpoint';
import { LinearGradient } from 'expo-linear-gradient';
import Logo from '../../components/ui/Logo';
import { getOrgStats } from '../../services/orgStats';
import { mealsFromLbs } from '../../services/impact';
import Icon from '../../components/ui/Icon';

const fmt = (n) => (n ? Math.round(n).toLocaleString('en-US') : '0');

// Copy per audience. Sign-in itself is identical: the account's role
// decides where the user lands, so picking the "wrong" tab never blocks.
const AUDIENCES = {
  volunteer: {
    label: 'Volunteer',
    icon: 'heart',
    steps: [
      { icon: 'pin', text: 'Share your area' },
      { icon: 'truck', text: 'Pick up nearby food' },
      { icon: 'home', text: 'Drop it where it’s needed' },
    ],
    subtitle: 'Sign in to find food rescues near you.',
    placeholder: 'you@email.com',
    signupPrompt: 'New to Better Nature? ', signupAction: 'Create an account', signupRoute: 'SignupStep1',
    headline: 'Rescue food.\nRestore nature.',
    body: 'Pick up surplus food nearby and drop it where it’s needed, on your own schedule.',
  },
  partner: {
    label: 'Food partner',
    icon: 'store',
    steps: [
      { icon: 'camera', text: 'Post your surplus' },
      { icon: 'truck', text: 'A volunteer collects it' },
      { icon: 'receipt', text: 'Get your donation receipt' },
    ],
    subtitle: 'Sign in to post surplus food and track your pickups.',
    placeholder: 'you@restaurant.com',
    signupPrompt: 'Not a partner yet? ', signupAction: 'Apply to partner', signupRoute: 'RestaurantSignup',
    headline: 'Your surplus,\nsomeone’s dinner.',
    body: 'Post extra food in a minute. A vetted volunteer picks it up and you get a donation receipt.',
  },
};

export default function LoginScreen({ navigation, route }) {
  const [audience, setAudience] = useState(route?.params?.as === 'partner' ? 'partner' : 'volunteer');
  const copy = AUDIENCES[audience];
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(enter, { toValue: 1, duration: 450, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [enter]);
  const enterStyle = {
    opacity: enter,
    transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
  };
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
      if (!user) return;
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

  const showOAuth = ['web', 'ios'].includes(Platform.OS) && isFirebaseConfigured;
  const { breakpoint: bp } = useBreakpoint();
  const wide = bp !== 'phone';

  // Live public counters (same source as the website ticker). Shown
  // only when they load; nothing is hard-coded.
  const [stats, setStats] = useState(null);
  useEffect(() => {
    let alive = true;
    getOrgStats().then((s) => alive && setStats(s)).catch(() => {});
    return () => { alive = false; };
  }, []);

  const form = (
    <View>
      <View style={styles.segment} accessibilityRole="tablist">
        {Object.entries(AUDIENCES).map(([key, item]) => {
          const active = key === audience;
          return (
            <TouchableOpacity key={key} onPress={() => setAudience(key)} activeOpacity={0.85}
              style={[styles.segmentItem, active && styles.segmentItemActive]}
              accessibilityRole="tab" accessibilityState={{ selected: active }} accessibilityLabel={`Sign in as ${item.label}`}>
              <Icon name={item.icon} size={17} color={active ? Colors.green : Colors.grayMid} />
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{item.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {wide && <Text style={styles.eyebrow}>Better Nature</Text>}
      <BrushText variant="screenTitle" style={styles.title}>Welcome back</BrushText>
      <Text style={styles.subtitle}>{copy.subtitle}</Text>

      <Input
        label="Email"
        placeholder={copy.placeholder}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
      />
      <Input
        label="Password"
        placeholder="Your password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        onSubmitEditing={handleLogin}
      />
      <TouchableOpacity onPress={handleForgotPassword} style={styles.forgotBtn} accessibilityRole="button">
        <Text style={styles.forgotText}>Forgot password?</Text>
      </TouchableOpacity>

      <Button title="Sign in" onPress={handleLogin} loading={loading} style={styles.btn} />

      {showOAuth && (
        <>
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or continue with</Text>
            <View style={styles.dividerLine} />
          </View>
          <View style={wide ? styles.oauthRow : null}>
            <TouchableOpacity style={[styles.googleBtn, wide && styles.oauthHalf]} onPress={handleGoogle}
              disabled={loading} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Continue with Google">
              <Text style={styles.googleG}>G</Text>
              <Text style={styles.googleText}>Google</Text>
            </TouchableOpacity>
            {(Platform.OS === 'ios' || FEATURES.APPLE_SIGNIN) ? (
              <TouchableOpacity style={[styles.appleBtn, wide && styles.oauthHalf]} onPress={handleApple}
                disabled={loading} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Continue with Apple">
                <Text style={styles.appleText}>Apple</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </>
      )}

      <Text style={styles.signupLink} onPress={() => navigation.navigate(copy.signupRoute)} accessibilityRole="link">
        {copy.signupPrompt}<Text style={styles.signupBold}>{copy.signupAction}</Text>
      </Text>
    </View>
  );

  const steps = (
    <View style={styles.steps}>
      {copy.steps.map((step, i) => (
        <View key={step.text} style={styles.step}>
          <View style={styles.stepIcon}><Icon name={step.icon} size={18} color={Colors.white} /></View>
          <Text style={styles.stepText}><Text style={styles.stepNum}>{i + 1}  </Text>{step.text}</Text>
        </View>
      ))}
    </View>
  );

  const lbs = stats?.lbs || 0;
  const impact = lbs > 0 ? [
    { value: fmt(lbs), label: 'lbs rescued' },
    { value: fmt(mealsFromLbs(lbs)), label: 'meals' },
    ...(stats?.volunteers ? [{ value: fmt(stats.volunteers), label: 'volunteers' }] : []),
  ] : [];

  // ── Laptop / iPad: split screen ───────────────────────────────────
  if (wide) {
    return (
      <View style={styles.split}>
        <LinearGradient colors={['#1F4438', '#2A5648', '#3D7A67']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={[styles.brandPanel, bp === 'tablet' && styles.brandPanelTablet]}>
          <View style={[styles.glow, styles.glowPink]} />
          <View style={[styles.glow, styles.glowSage]} />
          <View style={[styles.ring, styles.ringA]} />
          <View style={[styles.ring, styles.ringB]} />
          <View style={styles.brandTop}>
            <View style={styles.brandLogo}><Logo size={40} /></View>
            <Text style={styles.brandName}>BetterNature</Text>
          </View>
          <Animated.View style={enterStyle}>
            <Text style={styles.brandKicker}>{audience === 'partner' ? 'FOR FOOD PARTNERS' : 'FOR VOLUNTEERS'}</Text>
            <Text style={[styles.brandHeadline, bp === 'tablet' && styles.brandHeadlineTablet]}>{copy.headline}</Text>
            <Text style={styles.brandBody}>{copy.body}</Text>
            {steps}
          </Animated.View>
          {impact.length ? (
            <View style={[styles.statRow, bp === 'tablet' && styles.statRowTablet]}>
              {impact.map((item) => (
                <View key={item.label} style={[styles.stat, bp === 'tablet' && styles.statTablet]}>
                  <Text style={styles.statValue}>{item.value}</Text>
                  <Text style={styles.statLabel}>{item.label}</Text>
                </View>
              ))}
            </View>
          ) : <View />}
        </LinearGradient>
        <KeyboardAvoidingView style={styles.formPanel} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.formScroll} keyboardShouldPersistTaps="handled">
            <Animated.View style={[styles.formCard, enterStyle]}>{form}</Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    );
  }

  // ── Phone: brand header with the form on an overlapping sheet ─────
  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.phoneRoot} contentContainerStyle={styles.phoneScroll} keyboardShouldPersistTaps="handled">
        <LinearGradient colors={['#1F4438', '#2A5648', '#3D7A67']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.phoneHero}>
          <View style={[styles.glow, styles.glowPinkPhone]} />
          <View style={[styles.ring, styles.ringPhone]} />
          <View style={styles.phoneLogoRing}><Logo size={80} /></View>
          <Text style={styles.phoneHeroTitle}>BetterNature</Text>
          <Text style={styles.phoneHeroTag}>Rescue food · Restore nature</Text>
          {impact.length ? (
            <View style={styles.phoneStatPill}>
              <Icon name="leaf" size={14} color={Colors.white} />
              <Text style={styles.phoneHeroStat}>{impact[0].value} lbs rescued so far</Text>
            </View>
          ) : null}
        </LinearGradient>
        <Animated.View style={[styles.sheet, enterStyle]}>{form}</Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },

  // Volunteer / partner switch
  segment: { flexDirection: 'row', backgroundColor: '#EEF2EF', borderRadius: 16, padding: 5, marginBottom: 26 },
  segmentItem: { flex: 1, minHeight: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', gap: 8 },
  segmentItemActive: { backgroundColor: Colors.white, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  segmentText: { fontSize: 15, fontWeight: '600', color: Colors.gray },
  segmentTextActive: { color: Colors.green, fontWeight: '700' },

  // Shared form
  eyebrow: { fontSize: 12, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', color: Colors.sage, marginBottom: 6 },
  title: { color: Colors.green },
  subtitle: { ...Type.body, color: Colors.gray, marginTop: 6, marginBottom: 28 },
  btn: { marginTop: 4 },
  forgotBtn: { alignSelf: 'flex-end', paddingVertical: 6, marginTop: -6, marginBottom: 14 },
  forgotText: { color: Colors.green, fontSize: 14, fontWeight: '600' },
  signupLink: { textAlign: 'center', marginTop: 26, ...Type.caption, fontSize: 14 },
  signupBold: { color: Colors.pink, fontWeight: '700' },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 20, gap: 10 },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.grayLight },
  dividerText: { fontSize: 12, color: Colors.grayMid },
  oauthRow: { flexDirection: 'row', gap: 12 },
  oauthHalf: { flex: 1, marginTop: 0 },
  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 50,
    borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.grayLight, backgroundColor: Colors.white,
  },
  googleG: { fontSize: 18, fontWeight: '700', color: '#4285F4' },
  googleText: { fontSize: 15, color: Colors.dark, fontWeight: '600' },
  appleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 50,
    borderRadius: Radius.lg, backgroundColor: '#000', marginTop: 10,
  },
  appleText: { fontSize: 15, color: '#fff', fontWeight: '600' },

  circle: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.07)' },

  // Phone
  phoneRoot: { flex: 1, backgroundColor: Colors.cream },
  phoneScroll: { flexGrow: 1 },
  phoneHero: { paddingTop: 60, paddingBottom: 76, alignItems: 'center', overflow: 'hidden' },
  phoneHeroTag: { color: 'rgba(255,255,255,0.8)', fontSize: 14, marginTop: 4, letterSpacing: 0.2 },
  phoneStatPill: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, paddingVertical: 7,
    paddingHorizontal: 14, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  circleC: { width: 260, height: 260, top: -90, right: -80 },
  phoneLogoRing: {
    width: 104, height: 104, borderRadius: 52, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)',
  },
  phoneHeroTitle: { color: Colors.white, fontSize: 28, fontWeight: '800', marginTop: 14, letterSpacing: -0.4 },
  phoneHeroStat: { color: Colors.white, fontSize: 13, fontWeight: '600' },
  sheet: {
    flex: 1, marginTop: -40, backgroundColor: Colors.cream, borderTopLeftRadius: 32, borderTopRightRadius: 32,
    paddingHorizontal: 24, paddingTop: 28, paddingBottom: 40,
    shadowColor: '#0B2A20', shadowOpacity: 0.12, shadowRadius: 24, shadowOffset: { width: 0, height: -6 },
  },

  // Laptop / iPad
  split: { flex: 1, flexDirection: 'row', backgroundColor: '#F4F1EC',
    ...(Platform.OS === 'web' ? { minHeight: '100vh' } : null) },
  brandPanel: { flex: 1.1, padding: 48, justifyContent: 'space-between', overflow: 'hidden' },
  brandPanelTablet: { flex: 0.9, padding: 36 },
  circleA: { width: 420, height: 420, top: -140, right: -160 },
  circleB: { width: 300, height: 300, bottom: -120, left: -100 },
  brandTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  brandLogo: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)' },
  brandKicker: { color: '#F6B3C2', fontSize: 12, fontWeight: '800', letterSpacing: 1.6, marginBottom: 14 },
  glow: { position: 'absolute', borderRadius: 999 },
  glowPink: { width: 380, height: 380, top: -120, right: -140, backgroundColor: 'rgba(160,214,186,0.22)',
    ...(Platform.OS === 'web' ? { filter: 'blur(60px)' } : null) },
  glowSage: { width: 420, height: 420, bottom: -180, left: -120, backgroundColor: 'rgba(111,163,163,0.30)',
    ...(Platform.OS === 'web' ? { filter: 'blur(70px)' } : null) },
  glowPinkPhone: { width: 260, height: 260, top: -90, right: -90, backgroundColor: 'rgba(160,214,186,0.24)',
    ...(Platform.OS === 'web' ? { filter: 'blur(50px)' } : null) },
  ring: { position: 'absolute', borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  ringA: { width: 520, height: 520, top: -200, right: -220 },
  ringB: { width: 340, height: 340, bottom: -140, left: -110 },
  ringPhone: { width: 300, height: 300, top: -120, left: -110 },
  steps: { marginTop: 28, gap: 12 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  stepText: { color: Colors.white, fontSize: 15, fontWeight: '600' },
  stepNum: { color: '#F6B3C2', fontWeight: '800' },
  brandName: { color: Colors.white, fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  brandHeadline: { color: Colors.white, fontSize: 48, lineHeight: 54, fontWeight: '800', letterSpacing: -1 },
  brandHeadlineTablet: { fontSize: 36, lineHeight: 42 },
  brandBody: { color: 'rgba(255,255,255,0.82)', fontSize: 16, lineHeight: 24, marginTop: 18, maxWidth: 420 },
  statRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  statRowTablet: { flexWrap: 'nowrap', gap: 8 },
  statTablet: { flex: 1, minWidth: 0, paddingHorizontal: 12 },
  stat: { backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: 18, paddingVertical: 14, paddingHorizontal: 18, minWidth: 110,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)',
    ...(Platform.OS === 'web' ? { backdropFilter: 'blur(12px)' } : null) },
  statValue: { color: Colors.white, fontSize: 22, fontWeight: '800' },
  statLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 13, marginTop: 2 },
  formPanel: { flex: 1 },
  formScroll: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  formCard: { width: '100%', maxWidth: 440, backgroundColor: Colors.white, borderRadius: 28, padding: 36,
    shadowColor: '#0B2A20', shadowOpacity: 0.08, shadowRadius: 30, shadowOffset: { width: 0, height: 12 },
    borderWidth: 1, borderColor: '#EEF0EC' },
});
