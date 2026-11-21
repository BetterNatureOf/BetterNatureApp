import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  View,
  Text,
  ScrollView,
  StyleSheet,
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
import BlossomField from '../../components/ui/BlossomField';

// Purely decorative shapes stay out of the screen-reader tree.
const DECOR = Platform.OS === 'web'
  ? { 'aria-hidden': true, pointerEvents: 'none' }
  : { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants', pointerEvents: 'none' };

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
    // Respect "Reduce motion": show the screen immediately.
    let cancelled = false;
    (AccessibilityInfo.isReduceMotionEnabled?.() ?? Promise.resolve(false))
      .catch(() => false)
      .then((reduce) => {
        if (cancelled) return;
        if (reduce) enter.setValue(1);
        else Animated.timing(enter, { toValue: 1, duration: 450, useNativeDriver: Platform.OS !== 'web' }).start();
      });
    return () => { cancelled = true; };
  }, [enter]);
  // Motion only, never visibility: if the animation is interrupted
  // (layout change, background tab) the content is still fully shown.
  const enterStyle = {
    transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
  };
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const passwordRef = useRef(null);
  const setUser = useAuthStore((s) => s.setUser);

  function goBack() {
    if (navigation.canGoBack?.()) navigation.goBack();
    else navigation.navigate('Welcome');
  }
  function editEmail(value) {
    setEmail(value);
    if (fieldErrors.email) setFieldErrors((f) => ({ ...f, email: '' }));
    setFormError(''); setNotice('');
  }
  function editPassword(value) {
    setPassword(value);
    if (fieldErrors.password) setFieldErrors((f) => ({ ...f, password: '' }));
    setFormError('');
  }

  async function handleLogin() {
    const errors = {
      email: !email.trim() ? 'Enter your email address.'
        : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? 'Enter a valid email address, like name@example.com.' : '',
      password: !password ? 'Enter your password.' : '',
    };
    setFieldErrors(errors);
    setFormError(''); setNotice('');
    if (errors.email || errors.password) return;
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
      setFormError(e?.message || 'That email and password didn’t match. Check them and try again.');
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
    setFormError(''); setNotice('');
    if (!target) {
      setFieldErrors((f) => ({ ...f, email: 'Enter the email you signed up with, then choose “Forgot password?” again.' }));
      return;
    }
    try {
      await sendResetEmail(target);
      setNotice(`We sent a password reset link to ${target}. It may take a minute to arrive.`);
    } catch (e) {
      setFormError(e?.message || 'We couldn’t send the reset email. Try again in a moment.');
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
              <Icon name={item.icon} size={17} color={active ? Colors.green : Colors.gray} />
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{item.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {wide && <Text style={styles.eyebrow}>Better Nature</Text>}
      <BrushText variant="screenTitle" style={styles.title} accessibilityRole="header">Welcome back</BrushText>
      <Text style={styles.subtitle}>{copy.subtitle}</Text>

      {!!formError && (
        <View style={[styles.banner, styles.bannerError]} accessibilityLiveRegion="assertive"
          {...(Platform.OS === 'web' ? { role: 'alert' } : null)}>
          <Icon name="alert" size={18} color="#B42318" />
          <Text style={[styles.bannerText, { color: '#7A1A12' }]}>{formError}</Text>
        </View>
      )}
      {!!notice && (
        <View style={[styles.banner, styles.bannerOk]} accessibilityLiveRegion="polite"
          {...(Platform.OS === 'web' ? { role: 'status' } : null)}>
          <Icon name="mail" size={18} color={Colors.green} />
          <Text style={[styles.bannerText, { color: Colors.green }]}>{notice}</Text>
        </View>
      )}

      <Input
        label="Email"
        placeholder={copy.placeholder}
        value={email}
        onChangeText={editEmail}
        error={fieldErrors.email}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="next"
        blurOnSubmit={false}
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <Input
        label="Password"
        placeholder="Your password"
        ref={passwordRef}
        value={password}
        onChangeText={editPassword}
        error={fieldErrors.password}
        secureTextEntry={!showPassword}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={handleLogin}
        right={(
          <TouchableOpacity onPress={() => setShowPassword((v) => !v)} style={styles.eyeBtn}
            accessibilityRole="button" accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
            accessibilityState={{ checked: showPassword }} hitSlop={8}>
            <Icon name={showPassword ? 'eye-off' : 'eye'} size={20} color={Colors.gray} />
          </TouchableOpacity>
        )}
      />
      <TouchableOpacity onPress={handleForgotPassword} style={styles.forgotBtn} accessibilityRole="button"
        accessibilityLabel="Forgot password? Email me a reset link" hitSlop={8}>
        <Text style={styles.forgotText}>Forgot password?</Text>
      </TouchableOpacity>

      <Button title={loading ? 'Signing in…' : 'Sign in'} onPress={handleLogin} loading={loading} disabled={loading}
        style={styles.btn} accessibilityLabel="Sign in" />

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

      <View style={styles.signupRow}>
        <Text style={styles.signupLink}>{copy.signupPrompt}</Text>
        <TouchableOpacity onPress={() => navigation.navigate(copy.signupRoute)} accessibilityRole="link"
          accessibilityLabel={copy.signupAction} style={styles.signupTap} hitSlop={8}>
          <Text style={[styles.signupLink, styles.signupBold]}>{copy.signupAction}</Text>
        </TouchableOpacity>
      </View>
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
          <BlossomField density={42} width={700} height={900} quietZone="32% 52%" />
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
            <TouchableOpacity onPress={goBack} style={[styles.backBtn, styles.backBtnWide]} accessibilityRole="button"
              accessibilityLabel="Go back" hitSlop={8}>
              <Icon name="back" size={20} color={Colors.green} />
              <Text style={styles.backTextDark}>Back</Text>
            </TouchableOpacity>
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
          <BlossomField density={20} width={420} height={360} quietZone="50% 62%" />
          <TouchableOpacity onPress={goBack} style={[styles.backBtn, styles.backBtnPhone]} accessibilityRole="button"
            accessibilityLabel="Go back" hitSlop={8}>
            <Icon name="back" size={20} color={Colors.white} />
            <Text style={styles.backTextLight}>Back</Text>
          </TouchableOpacity>
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

  // Navigation + feedback
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 12,
    borderRadius: 999 },
  backBtnPhone: { position: 'absolute', top: 14, left: 12, backgroundColor: 'rgba(255,255,255,0.14)', zIndex: 2 },
  backBtnWide: { alignSelf: 'flex-start', marginBottom: 16, marginLeft: -12 },
  backTextLight: { color: Colors.white, fontSize: 15, fontWeight: '600' },
  backTextDark: { color: Colors.green, fontSize: 15, fontWeight: '600' },
  eyeBtn: { width: 48, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  banner: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 14, padding: 14, marginBottom: 18,
    borderWidth: 1 },
  bannerError: { backgroundColor: '#FEF3F2', borderColor: '#FECDCA' },
  bannerOk: { backgroundColor: Colors.greenLight, borderColor: '#CFE2DA' },
  bannerText: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '500' },
  signupRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap', marginTop: 22 },
  signupTap: { minHeight: 44, justifyContent: 'center' },

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
  forgotBtn: { alignSelf: 'flex-end', minHeight: 44, justifyContent: 'center', marginTop: -10, marginBottom: 8 },
  forgotText: { color: Colors.green, fontSize: 14, fontWeight: '600' },
  signupLink: { textAlign: 'center', ...Type.caption, fontSize: 15, color: Colors.gray },
  signupBold: { color: Colors.pink, fontWeight: '700' },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 20, gap: 10 },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.grayLight },
  dividerText: { fontSize: 13, color: Colors.gray },
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


  // Phone
  phoneRoot: { flex: 1, backgroundColor: Colors.cream },
  phoneScroll: { flexGrow: 1 },
  phoneHero: { paddingTop: 60, paddingBottom: 76, alignItems: 'center', overflow: 'hidden' },
  phoneHeroTag: { color: 'rgba(255,255,255,0.8)', fontSize: 14, marginTop: 4, letterSpacing: 0.2 },
  phoneStatPill: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, paddingVertical: 7,
    paddingHorizontal: 14, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
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
  brandTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  brandLogo: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)' },
  brandKicker: { color: '#F6B3C2', fontSize: 12, fontWeight: '800', letterSpacing: 1.6, marginBottom: 14 },
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
