// Shared frame for every sign-up / onboarding step so the journey from
// Welcome feels like one flow: a back button, "Step 2 of 3" progress,
// a clear title, and the same blossom brand panel as Welcome and Login.
//
// Phone: compact green header (back + progress) over a cream sheet.
// iPad / laptop: brand panel on the left listing the steps (current one
// highlighted, done ones checked), form card on the right.
import React from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../../config/theme';
import BrushText from './BrushText';
import Icon from './Icon';
import Logo from './Logo';
import BlossomField from './BlossomField';
import useBreakpoint from '../../hooks/useBreakpoint';

const GREENS = ['#1F4438', '#2A5648', '#3D7A67'];
const web = Platform.OS === 'web';

function BackButton({ onPress, label = 'Back', light }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label === 'Back' ? 'Go back' : label}
      hitSlop={8} style={({ hovered }) => [styles.back, light ? styles.backLight : styles.backDark,
        hovered && (light ? styles.backLightHover : styles.backDarkHover)]}>
      <Icon name={label === 'Back' ? 'back' : 'logout'} size={18} color={light ? Colors.white : Colors.green} />
      <Text style={[styles.backText, { color: light ? Colors.white : Colors.green }]}>{label}</Text>
    </Pressable>
  );
}

function Progress({ step, total, light }) {
  if (!step || !total || total < 2) return null;
  return (
    <View style={styles.progressWrap} accessible accessibilityRole="progressbar"
      accessibilityLabel={`Step ${step} of ${total}`}
      accessibilityValue={{ min: 0, max: total, now: step }}>
      <Text style={[styles.progressText, { color: light ? 'rgba(255,255,255,0.9)' : Colors.gray }]}>
        Step {step} of {total}
      </Text>
      <View style={[styles.track, light ? styles.trackLight : styles.trackDark]}>
        <View style={[styles.fill, { width: `${(step / total) * 100}%` }, light ? styles.fillLight : styles.fillDark]} />
      </View>
    </View>
  );
}

/**
 * @param {object} props
 * @param {string} props.title
 * @param {string=} props.subtitle
 * @param {number=} props.step        current step (1-based)
 * @param {string[]=} props.steps     step names, for progress + the brand panel list
 * @param {string=} props.kicker      small label over the panel headline
 * @param {string=} props.headline    brand panel headline
 * @param {() => void=} props.onBack  omit to hide the back button
 * @param {string=} props.backLabel   e.g. "Sign out" when there is no screen to go back to
 */
export default function AuthScaffold({
  title, subtitle, step, steps = [], kicker, headline, onBack, backLabel = 'Back', children,
}) {
  const { breakpoint } = useBreakpoint();
  const wide = breakpoint !== 'phone';
  const total = steps.length;

  const body = (
    <>
      <BrushText variant="screenTitle" style={styles.title} accessibilityRole="header">{title}</BrushText>
      {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      {children}
    </>
  );

  if (wide) {
    return (
      <View style={styles.split}>
        <LinearGradient colors={GREENS} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={[styles.panel, breakpoint === 'tablet' && styles.panelTablet]}>
          <BlossomField density={34} width={700} height={900} quietZone="34% 50%" />
          <View style={styles.brandTop}>
            <View style={styles.brandLogo}><Logo size={36} /></View>
            <Text style={styles.brandName}>BetterNature</Text>
          </View>
          <View>
            {!!kicker && <Text style={styles.kicker}>{kicker.toUpperCase()}</Text>}
            {!!headline && (
              <Text style={[styles.headline, breakpoint === 'tablet' && styles.headlineTablet]}>{headline}</Text>
            )}
            {total > 1 && (
              <View style={styles.stepList}>
                {steps.map((name, i) => {
                  const n = i + 1, done = step > n, current = step === n;
                  return (
                    <View key={name} style={styles.stepRow}
                      accessibilityLabel={`Step ${n}, ${name}${done ? ', done' : current ? ', current step' : ''}`}>
                      <View style={[styles.stepDot, done && styles.stepDotDone, current && styles.stepDotCurrent]}>
                        {done ? <Icon name="check" size={14} color={Colors.green} />
                          : <Text style={[styles.stepNum, current && styles.stepNumCurrent]}>{n}</Text>}
                      </View>
                      <Text style={[styles.stepName, (done || current) && styles.stepNameActive]}>{name}</Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
          <View />
        </LinearGradient>
        <KeyboardAvoidingView style={styles.side} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView style={styles.formScroll} contentContainerStyle={styles.sideInner} keyboardShouldPersistTaps="handled">
            <View style={styles.sideCol}>
              <View style={styles.sideTop}>
                {onBack ? <BackButton onPress={onBack} label={backLabel} /> : <View />}
                <Progress step={step} total={total} />
              </View>
              <View style={styles.card}>{body}</View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.phoneRoot} contentContainerStyle={styles.phoneScroll} keyboardShouldPersistTaps="handled">
        <LinearGradient colors={GREENS} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
          <BlossomField density={12} width={420} height={170} />
          <View style={styles.headerRow}>
            {onBack ? <BackButton onPress={onBack} label={backLabel} light /> : <View />}
            <View style={styles.headerBrand}>
              <Logo size={26} />
              <Text style={styles.headerName}>BetterNature</Text>
            </View>
          </View>
          <Progress step={step} total={total} light />
        </LinearGradient>
        <View style={styles.sheet}>{body}</View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  // Bound web scroll views to the viewport; otherwise flex content grows
  // past the window while the document itself has scrolling disabled.
  flex: { flex: 1, ...(web ? { height: '100dvh', maxHeight: '100dvh', minHeight: 0, overflow: 'hidden' } : null) },
  title: { color: Colors.green },
  subtitle: { fontSize: 16, lineHeight: 23, color: Colors.gray, marginTop: 6, marginBottom: 24 },

  back: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 12, borderRadius: 999,
    ...(web ? { transitionProperty: 'background-color', transitionDuration: '150ms' } : null) },
  backLight: { backgroundColor: 'rgba(255,255,255,0.14)' },
  backLightHover: { backgroundColor: 'rgba(255,255,255,0.24)' },
  backDark: { marginLeft: -12 },
  backDarkHover: { backgroundColor: Colors.greenLight },
  backText: { fontSize: 15, fontWeight: '600' },

  progressWrap: { minWidth: 120 },
  progressText: { fontSize: 13, fontWeight: '600', marginBottom: 6, textAlign: 'right' },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  trackLight: { backgroundColor: 'rgba(255,255,255,0.2)' },
  trackDark: { backgroundColor: '#E3E8E4' },
  fill: { height: '100%', borderRadius: 3 },
  fillLight: { backgroundColor: '#F6B3C2' },
  fillDark: { backgroundColor: Colors.green },

  // Wide
  split: { flex: 1, flexDirection: 'row', backgroundColor: '#F4F1EC', ...(web ? { height: '100dvh', maxHeight: '100dvh', minHeight: 0, overflow: 'hidden' } : null) },
  panel: { flex: 0.9, padding: 44, justifyContent: 'space-between', overflow: 'hidden' },
  panelTablet: { flex: 0.75, padding: 30 },
  brandTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  brandLogo: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)' },
  brandName: { color: Colors.white, fontSize: 19, fontWeight: '800' },
  kicker: { color: '#F6B3C2', fontSize: 12, fontWeight: '800', letterSpacing: 1.6, marginBottom: 12 },
  headline: { color: Colors.white, fontSize: 40, lineHeight: 46, fontWeight: '800', letterSpacing: -1 },
  headlineTablet: { fontSize: 30, lineHeight: 36 },
  stepList: { marginTop: 28, gap: 14 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepDot: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.35)' },
  stepDotCurrent: { backgroundColor: Colors.white, borderColor: Colors.white },
  stepDotDone: { backgroundColor: '#CFE8DC', borderColor: '#CFE8DC' },
  stepNum: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '700' },
  stepNumCurrent: { color: Colors.green },
  stepName: { color: 'rgba(255,255,255,0.7)', fontSize: 16, fontWeight: '600' },
  stepNameActive: { color: Colors.white },
  side: { flex: 1.1, minHeight: 0, minWidth: 0 },
  formScroll: { flex: 1, minHeight: 0 },
  sideInner: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 36 },
  sideCol: { width: '100%', maxWidth: 560 },
  sideTop: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 14 },
  card: { backgroundColor: Colors.white, borderRadius: 28, padding: 32, borderWidth: 1, borderColor: '#EEF0EC',
    shadowColor: '#0B2A20', shadowOpacity: 0.08, shadowRadius: 30, shadowOffset: { width: 0, height: 12 } },

  // Phone
  phoneRoot: { flex: 1, backgroundColor: Colors.cream },
  phoneScroll: { flexGrow: 1 },
  header: { paddingTop: 14, paddingHorizontal: 16, paddingBottom: 48, overflow: 'hidden', gap: 18 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerBrand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerName: { color: Colors.white, fontSize: 16, fontWeight: '800' },
  sheet: { flex: 1, marginTop: -28, backgroundColor: Colors.cream, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 22, paddingTop: 26, paddingBottom: 40 },
});
