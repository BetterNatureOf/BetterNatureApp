// First screen a visitor sees. Two clear paths (Volunteer / Food partner),
// a sign-in link, and live public impact numbers over the interactive
// cherry-blossom field. Phone: brand hero + choice sheet. iPad/laptop:
// split screen with the same pieces side by side.
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../../config/theme';
import { siteVal } from '../../services/siteContent';
import Logo from '../../components/ui/Logo';
import Icon from '../../components/ui/Icon';
import BlossomField from '../../components/ui/BlossomField';
import { getOrgStats, MEALS_PER_LB } from '../../services/orgStats';
import { mealsFromLbs } from '../../services/impact';
import { fetchChapters } from '../../services/database';
import useBreakpoint from '../../hooks/useBreakpoint';

const fmt = (n) => (n ? Math.round(n).toLocaleString('en-US') : '0');
const GREENS = ['#1F4438', '#2A5648', '#3D7A67'];
const web = Platform.OS === 'web';

// Counts up to `target` once it loads; instant for "Reduce motion".
function useCountUp(target, duration = 1200) {
  const [value, setValue] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (!target) return undefined;
    let raf, cancelled = false;
    const start = from.current;
    (AccessibilityInfo.isReduceMotionEnabled?.() ?? Promise.resolve(false)).catch(() => false).then((reduce) => {
      if (cancelled) return;
      if (reduce || typeof requestAnimationFrame === 'undefined') { from.current = target; setValue(target); return; }
      const t0 = Date.now();
      const tick = () => {
        const p = Math.min(1, (Date.now() - t0) / duration);
        const eased = 1 - (1 - p) ** 3;
        setValue(start + (target - start) * eased);
        if (p < 1 && !cancelled) raf = requestAnimationFrame(tick);
        else from.current = target;
      };
      raf = requestAnimationFrame(tick);
    });
    return () => { cancelled = true; if (raf) cancelAnimationFrame(raf); };
  }, [target, duration]);
  return value;
}

function ChoiceCard({ icon, title, body, onPress, accent }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title}. ${body}`}
      style={({ hovered, pressed, focused }) => [
        styles.card,
        hovered && styles.cardHover,
        focused && styles.cardFocus,
        pressed && styles.cardPressed,
      ]}>
      {({ hovered }) => (
        <>
          <View style={[styles.cardIcon, { backgroundColor: accent.bg }]}>
            <Icon name={icon} size={24} color={accent.fg} />
          </View>
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>{title}</Text>
            <Text style={styles.cardBody}>{body}</Text>
          </View>
          <View style={[styles.cardArrow, hovered && styles.cardArrowHover]}>
            <Icon name="forward" size={20} color={hovered ? Colors.white : Colors.green} />
          </View>
        </>
      )}
    </Pressable>
  );
}

function Stat({ value, label, compact }) {
  return (
    <View style={[styles.stat, compact && styles.statCompact]} accessible accessibilityLabel={`${fmt(value)} ${label}`}>
      <Text style={[styles.statValue, compact && styles.statValueCompact]}>{fmt(value)}</Text>
      <Text style={[styles.statLabel, compact && styles.statLabelCompact]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

export default function WelcomeScreen({ navigation }) {
  const { breakpoint } = useBreakpoint();
  const wide = breakpoint !== 'phone';
  const [stats, setStats] = useState(null);
  const [chapters, setChapters] = useState(0);

  useEffect(() => {
    let alive = true;
    function refresh() {
      // A2 — org_stats carries the public volunteer count directly;
      // this screen is anonymous and can no longer enumerate /users.
      getOrgStats().then((s) => alive && setStats(s)).catch(() => {});
      fetchChapters().then((c) => alive && setChapters(c.length)).catch(() => {});
    }
    refresh();
    // Re-pull every 15s so the numbers track real activity.
    const t = setInterval(refresh, 15000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const lbsTarget = stats?.lbs || 0;
  const lbs = useCountUp(lbsTarget);
  const meals = useCountUp(mealsFromLbs(lbsTarget));
  const volunteers = useCountUp(stats?.volunteers || 0);
  const chapterCount = useCountUp(chapters);
  const hasStats = lbsTarget > 0;

  const choices = (
    <View>
      <Text style={styles.ask} accessibilityRole="header">How do you want to help?</Text>
      <ChoiceCard icon="heart" title="Volunteer"
        body="Pick up surplus food nearby and drop it where it’s needed."
        accent={{ bg: Colors.pinkLight, fg: Colors.pink }}
        onPress={() => navigation.navigate('SignupStep1')} />
      <ChoiceCard icon="store" title="Food partner"
        body="Restaurants and stores: post extra food and a vetted volunteer collects it."
        accent={{ bg: Colors.greenLight, fg: Colors.green }}
        onPress={() => navigation.navigate('RestaurantSignup')} />
      <View style={styles.signinRow}>
        <Text style={styles.signinText}>Already have an account?</Text>
        <Pressable onPress={() => navigation.navigate('Login')} accessibilityRole="link" accessibilityLabel="Sign in"
          style={({ hovered }) => [styles.signinBtn, hovered && styles.signinBtnHover]} hitSlop={8}>
          <Text style={styles.signinLink}>Sign in</Text>
        </Pressable>
      </View>
      <Text style={styles.footnote}>
        Chapter presidents and executives sign in with their existing account — leadership roles are granted in the app.
      </Text>
    </View>
  );

  const statRow = hasStats ? (
    <View style={!wide && styles.statsPhone}>
      <View style={[styles.stats, !wide && styles.statsRowPhone]}>
        <Stat compact={!wide} value={lbs} label="lbs rescued" />
        <Stat compact={!wide} value={meals} label="est. meals" />
        {stats?.volunteers ? <Stat compact={!wide} value={volunteers} label="volunteers" /> : null}
        {chapters ? <Stat compact={!wide} value={chapterCount} label={chapters === 1 ? 'chapter' : 'chapters'} /> : null}
      </View>
      <Text style={[styles.method, !wide && styles.methodPhone]}>Meals are estimated at {MEALS_PER_LB} per pound of food rescued.</Text>
    </View>
  ) : null;

  const tagline = siteVal('hero.eyebrow', 'Food rescue · Conservation · Clean water');

  if (wide) {
    return (
      <View style={styles.split}>
        <LinearGradient colors={GREENS} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={[styles.panel, breakpoint === 'tablet' && styles.panelTablet]}>
          <BlossomField density={48} width={760} height={900} quietZone="34% 50%" />
          <View style={styles.brandTop}>
            <View style={styles.brandLogo}><Logo size={40} /></View>
            <Text style={styles.brandName}>BetterNature</Text>
          </View>
          <View>
            <Text style={styles.kicker}>{tagline.toUpperCase()}</Text>
            <Text style={[styles.headline, breakpoint === 'tablet' && styles.headlineTablet]}>
              Rescue food.{'\n'}Restore nature.
            </Text>
            <Text style={styles.lede}>
              Volunteers, food partners and chapters moving good food to the people and places that need it.
            </Text>
          </View>
          {statRow || <View />}
          <Text style={styles.hint} {...(web ? { 'aria-hidden': true } : null)}>Tip: click the background ✿</Text>
        </LinearGradient>
        <ScrollView style={styles.side} contentContainerStyle={styles.sideInner}>
          <View style={styles.sideCard}>{choices}</View>
        </ScrollView>
      </View>
    );
  }

  return (
    <ScrollView style={styles.phoneRoot} contentContainerStyle={styles.phoneScroll}>
      <LinearGradient colors={GREENS} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <BlossomField density={24} width={420} height={460} quietZone="50% 55%" />
        <View style={styles.heroLogo}><Logo size={92} /></View>
        <Text style={styles.heroTitle}>BetterNature</Text>
        <Text style={styles.heroTag}>{tagline}</Text>
        {statRow}
      </LinearGradient>
      <View style={styles.sheet}>{choices}</View>
    </ScrollView>
  );
}

const lift = web ? { transitionProperty: 'transform, box-shadow, background-color, border-color', transitionDuration: '160ms' } : null;

const styles = StyleSheet.create({
  // Choices
  ask: { fontSize: 22, fontWeight: '800', color: Colors.dark, letterSpacing: -0.3, marginBottom: 16 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 88, padding: 16, marginBottom: 12,
    backgroundColor: Colors.white, borderRadius: 20, borderWidth: 1, borderColor: '#E7EBE6',
    shadowColor: '#0B2A20', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2,
    ...lift,
  },
  cardHover: { transform: [{ translateY: -2 }], borderColor: '#CFE2DA', shadowOpacity: 0.12, shadowRadius: 20 },
  cardFocus: { borderColor: Colors.green, borderWidth: 2 },
  cardPressed: { transform: [{ scale: 0.98 }] },
  cardIcon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  cardText: { flex: 1 },
  cardTitle: { fontSize: 17, fontWeight: '700', color: Colors.dark },
  cardBody: { fontSize: 14, lineHeight: 20, color: Colors.gray, marginTop: 3 },
  cardArrow: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.greenLight, ...lift },
  cardArrowHover: { backgroundColor: Colors.green, transform: [{ translateX: 3 }] },
  signinRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', marginTop: 14 },
  signinText: { fontSize: 15, color: Colors.gray },
  signinBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8, borderRadius: 10 },
  signinBtnHover: { backgroundColor: Colors.pinkLight },
  signinLink: { fontSize: 15, fontWeight: '700', color: Colors.pink },
  footnote: { fontSize: 13, lineHeight: 19, color: Colors.gray, textAlign: 'center', marginTop: 18 },

  // Stats
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stat: { backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: 18, paddingVertical: 12, paddingHorizontal: 16,
    minWidth: 96, borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)',
    ...(web ? { backdropFilter: 'blur(12px)' } : null) },
  statValue: { color: Colors.white, fontSize: 22, fontWeight: '800' },
  statLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 2 },
  statsPhone: { alignSelf: 'stretch' },
  statsRowPhone: { flexWrap: 'nowrap', gap: 8 },
  statCompact: { flex: 1, minWidth: 0, paddingHorizontal: 4, paddingVertical: 10, alignItems: 'center' },
  statValueCompact: { fontSize: 18 },
  statLabelCompact: { fontSize: 10.5, letterSpacing: -0.1 },
  methodPhone: { textAlign: 'center' },
  method: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 10 },

  // Wide
  split: { flex: 1, flexDirection: 'row', backgroundColor: '#F4F1EC', ...(web ? { minHeight: '100vh' } : null) },
  panel: { flex: 1.15, padding: 48, justifyContent: 'space-between', overflow: 'hidden' },
  panelTablet: { flex: 1, padding: 32 },
  brandTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  brandLogo: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)' },
  brandName: { color: Colors.white, fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  kicker: { color: '#F6B3C2', fontSize: 12, fontWeight: '800', letterSpacing: 1.6, marginBottom: 14 },
  headline: { color: Colors.white, fontSize: 56, lineHeight: 60, fontWeight: '800', letterSpacing: -1.4 },
  headlineTablet: { fontSize: 38, lineHeight: 44 },
  lede: { color: 'rgba(255,255,255,0.85)', fontSize: 17, lineHeight: 26, marginTop: 18, maxWidth: 460 },
  hint: { position: 'absolute', right: 20, bottom: 14, color: 'rgba(255,255,255,0.45)', fontSize: 12 },
  side: { flex: 1 },
  sideInner: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  sideCard: { width: '100%', maxWidth: 460 },

  // Phone
  phoneRoot: { flex: 1, backgroundColor: Colors.cream },
  phoneScroll: { flexGrow: 1 },
  hero: { paddingTop: 72, paddingBottom: 64, paddingHorizontal: 24, alignItems: 'center', overflow: 'hidden' },
  heroLogo: { width: 116, height: 116, borderRadius: 58, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)' },
  heroTitle: { color: Colors.white, fontSize: 34, fontWeight: '800', letterSpacing: -0.6, marginTop: 16 },
  heroTag: { color: 'rgba(255,255,255,0.85)', fontSize: 15, marginTop: 6, marginBottom: 22 },
  sheet: { flex: 1, marginTop: -36, backgroundColor: Colors.cream, borderTopLeftRadius: 32, borderTopRightRadius: 32,
    paddingHorizontal: 20, paddingTop: 28, paddingBottom: 40,
    shadowColor: '#0B2A20', shadowOpacity: 0.12, shadowRadius: 24, shadowOffset: { width: 0, height: -6 } },
});
