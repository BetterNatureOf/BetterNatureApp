// The Welcome screen's visual language, reusable on inner screens:
//   BrandHero   green gradient header with white title, optional kicker,
//               subtitle and glass stat chips (same greens and chips as
//               Welcome)
//   BrandSheet  the cream sheet with a 32px top radius that overlaps the
//               hero, holding the screen's content
//   ActionCard  white card with an icon tile, title, body and an arrow
//               circle (Welcome's ChoiceCard)
// Keep these in step with src/screens/auth/WelcomeScreen.js.
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../../config/theme';
import Icon from './Icon';

export const BRAND_GREENS = ['#1F4438', '#2A5648', '#3D7A67'];
const web = Platform.OS === 'web';
const lift = web ? { transitionProperty: 'transform, box-shadow, background-color, border-color', transitionDuration: '160ms' } : null;

export function BrandHero({ title, kicker, subtitle, stats = [], onBack, backLabel = 'Back', accessory, children }) {
  return (
    <LinearGradient colors={BRAND_GREENS} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
      <View style={styles.heroInner}>
        {!!accessory && <View style={styles.accessory}>{accessory}</View>}
        {onBack && (
          <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel={backLabel} hitSlop={8}
            style={({ hovered }) => [styles.back, hovered && styles.backHover]}>
            <Icon name="back" size={18} color={Colors.white} />
            <Text style={styles.backText}>{backLabel}</Text>
          </Pressable>
        )}
        {!!kicker && <Text style={[styles.kicker, !!accessory && styles.clearAccessory]}>{kicker.toUpperCase()}</Text>}
        <Text accessibilityRole="header" style={[styles.title, !!accessory && styles.clearAccessory]}>{title}</Text>
        {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        {stats.filter(Boolean).length > 0 && (
          <View style={styles.stats}>
            {stats.filter(Boolean).map((s) => (
              <View key={s.label} style={[styles.stat, s.tone === 'alert' && styles.statAlert]} accessible accessibilityLabel={`${s.value} ${s.label}`}>
                <Text style={styles.statValue}>{s.value}</Text>
                <Text style={styles.statLabel} numberOfLines={1}>{s.label}</Text>
              </View>
            ))}
          </View>
        )}
        {children}
      </View>
    </LinearGradient>
  );
}

export function BrandSheet({ children, style }) {
  return <View style={[styles.sheet, style]}><View style={styles.sheetInner}>{children}</View></View>;
}

export function ActionCard({ icon, title, body, meta, onPress, accent = 'green', highlight = false, accessibilityLabel }) {
  const tone = accent === 'pink' ? { bg: Colors.pinkLight, fg: Colors.pink }
    : accent === 'amber' ? { bg: Colors.amberLight, fg: '#9A6212' } : { bg: Colors.greenLight, fg: Colors.green };
  const content = (hovered) => (
    <>
      {!!icon && <View style={[styles.cardIcon, { backgroundColor: tone.bg }]}><Icon name={icon} size={22} color={tone.fg} /></View>}
      <View style={styles.cardText}>
        <Text style={styles.cardTitle}>{title}</Text>
        {!!body && <Text style={styles.cardBody}>{body}</Text>}
        {!!meta && <Text style={[styles.cardMeta, highlight && styles.cardMetaHighlight]}>{meta}</Text>}
      </View>
      {onPress && (
        <View style={[styles.cardArrow, hovered && styles.cardArrowHover]}>
          <Icon name="forward" size={18} color={hovered ? Colors.white : Colors.green} />
        </View>
      )}
    </>
  );
  const label = accessibilityLabel || [title, body, meta].filter(Boolean).join('. ');
  if (!onPress) return <View accessibilityLabel={label} style={[styles.card, highlight && styles.cardHighlight]}>{content(false)}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={({ hovered, pressed, focused }) => [styles.card, highlight && styles.cardHighlight, hovered && styles.cardHover,
        focused && styles.cardFocus, pressed && styles.cardPressed]}>
      {({ hovered }) => content(hovered)}
    </Pressable>
  );
}

// Round glass button for the hero's top-right (e.g. notifications).
export function HeroIconButton({ icon, label, onPress, dot = false }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={6}
      style={({ hovered }) => [styles.iconBtn, hovered && styles.iconBtnHover]}>
      <Icon name={icon} size={18} color={Colors.white} />
      {dot && <View style={styles.iconDot} />}
    </Pressable>
  );
}

export const brand = StyleSheet.create({
  section: { fontSize: 20, fontWeight: '800', color: Colors.dark, letterSpacing: -0.3, marginTop: 6, marginBottom: 12 },
  caption: { fontSize: 13, lineHeight: 19, color: Colors.gray },
  panel: { backgroundColor: Colors.white, borderRadius: 20, borderWidth: 1, borderColor: '#E7EBE6', padding: 16, marginBottom: 12,
    shadowColor: '#0B2A20', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
});

const styles = StyleSheet.create({
  hero: { paddingTop: web ? 28 : 56, paddingBottom: 60, paddingHorizontal: 20, overflow: 'hidden' },
  heroInner: { width: '100%', maxWidth: 760, alignSelf: 'center' },
  accessory: { position: 'absolute', top: 0, right: 0, zIndex: 2 },
  clearAccessory: { paddingRight: 56 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', minHeight: 44, paddingRight: 10, borderRadius: 12, marginBottom: 6 },
  backHover: { backgroundColor: 'rgba(255,255,255,0.10)' },
  backText: { color: Colors.white, fontSize: 15, fontWeight: '600' },
  kicker: { color: '#F6B3C2', fontSize: 12, fontWeight: '800', letterSpacing: 1.6, marginBottom: 8 },
  title: { color: Colors.white, fontSize: 32, lineHeight: 38, fontWeight: '800', letterSpacing: -0.8 },
  subtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 15, lineHeight: 22, marginTop: 6 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 18 },
  stat: { backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: 18, paddingVertical: 10, paddingHorizontal: 14, minWidth: 92,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)', ...(web ? { backdropFilter: 'blur(12px)' } : null) },
  statAlert: { backgroundColor: 'rgba(246,179,194,0.20)', borderColor: 'rgba(246,179,194,0.45)' },
  statValue: { color: Colors.white, fontSize: 20, fontWeight: '800' },
  statLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 2 },
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  iconBtnHover: { backgroundColor: 'rgba(255,255,255,0.2)' },
  iconDot: { position: 'absolute', top: 10, right: 11, width: 9, height: 9, borderRadius: 5, backgroundColor: '#F6B3C2', borderWidth: 1.5, borderColor: '#2A5648' },
  sheet: { flex: 1, marginTop: -36, backgroundColor: Colors.cream, borderTopLeftRadius: 32, borderTopRightRadius: 32,
    paddingHorizontal: 16, paddingTop: 22, paddingBottom: 40,
    shadowColor: '#0B2A20', shadowOpacity: 0.12, shadowRadius: 24, shadowOffset: { width: 0, height: -6 } },
  sheetInner: { width: '100%', maxWidth: 760, alignSelf: 'center', gap: 12 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 80, padding: 14,
    backgroundColor: Colors.white, borderRadius: 20, borderWidth: 1, borderColor: '#E7EBE6',
    shadowColor: '#0B2A20', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2, ...lift },
  cardHighlight: { borderColor: Colors.green, borderWidth: 2 },
  cardHover: { transform: [{ translateY: -2 }], borderColor: '#CFE2DA', shadowOpacity: 0.12, shadowRadius: 20 },
  cardFocus: { borderColor: Colors.green, borderWidth: 2 },
  cardPressed: { transform: [{ scale: 0.98 }] },
  cardIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  cardText: { flex: 1, gap: 2 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: Colors.dark },
  cardBody: { fontSize: 14, lineHeight: 20, color: Colors.gray },
  cardMeta: { fontSize: 13, lineHeight: 18, color: Colors.gray },
  cardMetaHighlight: { color: Colors.green, fontWeight: '700' },
  cardArrow: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.greenLight, ...lift },
  cardArrowHover: { backgroundColor: Colors.green, transform: [{ translateX: 3 }] },
});
