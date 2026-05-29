// Restaurant home / dashboard.
//
// Fool-proofing pass:
//   1. If `restaurant_complete` is false, the very first thing on screen
//      is a yellow setup banner — restaurants can't possibly miss what
//      they need to do before they can post.
//   2. The first-class section is "Your recent posts" — restaurants land
//      here and immediately see whether a volunteer has claimed their
//      surplus and where it's at in the pipeline.
//   3. Empty state for first-timers explains the loop in one sentence
//      and points the eye at the Post-surplus tile.
//   4. Every dialog uses the cross-platform notify/confirm helpers so
//      onPress callbacks fire on web too.
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import StatCard from '../../components/ui/StatCard';
import ResponsiveContainer from '../../components/ui/ResponsiveContainer';
import useBreakpoint from '../../hooks/useBreakpoint';
import useAuthStore from '../../store/authStore';
import { signOut } from '../../services/auth';
import { payWithApplePay, isApplePayAvailable } from '../../services/payments';
import {
  recordDonation, fetchDonationHistory, fetchPickupsByRestaurant,
} from '../../services/database';
import { requireVerifiedId } from '../../services/idGate';
import { notify, notifyThen, confirm } from '../../services/ui';
import Icon from '../../components/ui/Icon';
import AnimatedPressable from '../../components/ui/AnimatedPressable';
import FadeInView from '../../components/ui/FadeInView';

const STATUS_TONE = {
  available: { bg: '#FFF2CF', fg: '#7A5400', label: 'Waiting on a volunteer' },
  claimed:   { bg: '#E5F2EC', fg: '#1B5E3F', label: 'Volunteer claimed' },
  enroute:   { bg: '#E1EDFA', fg: '#1565C0', label: 'On the way to fridge' },
  completed: { bg: '#DFF1E2', fg: '#2E7D32', label: 'Delivered' },
  cancelled: { bg: '#F8DADA', fg: '#8E1B1B', label: 'Cancelled' },
};

function prettyTime(p) {
  // Best-effort: Firestore Timestamp → JS Date → relative-ish label.
  const ms = p.created_at?.toMillis?.() || new Date(p.created_at || 0).getTime();
  if (!ms) return '';
  const diffMin = Math.round((Date.now() - ms) / 60000);
  if (diffMin < 1)  return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(ms).toLocaleDateString();
}

export default function RestDashboard({ navigation }) {
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.signOut);
  const { isWide } = useBreakpoint();
  const [history, setHistory] = useState([]);
  const [pickups, setPickups] = useState([]);
  const [meals, setMeals] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  // Restaurant identifier — we treat the user uid as the restaurant_id
  // for the lightweight "user is the restaurant" model, with a fallback
  // to an explicit field for the bigger "user manages restaurant" case.
  const restaurantId = user?.restaurant_id || user?.id;
  const profileComplete = user?.restaurant_complete || !!(user?.address && user?.name);

  const load = useCallback(async () => {
    try {
      const [hist, pks] = await Promise.all([
        fetchDonationHistory(restaurantId).catch(() => []),
        fetchPickupsByRestaurant(restaurantId, 6).catch(() => []),
      ]);
      setHistory(hist);
      setPickups(pks);
      const totalMeals = pks
        .filter((p) => p.status === 'completed')
        .reduce((sum, p) => sum + Math.round((p.actual_weight_lbs || p.estimated_weight_lbs || 0) * 1.2), 0);
      setMeals(totalMeals);
    } catch {}
  }, [restaurantId]);

  useEffect(() => { load(); }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function handleSignOut() {
    const ok = await confirm('Sign Out', 'Sign out of the restaurant portal?');
    if (!ok) return;
    try { await signOut(); } catch {}
    clearAuth();
  }

  async function handleSponsorDonation() {
    if (!isApplePayAvailable) {
      notify('Apple Pay unavailable', 'Apple Pay is only supported in the iOS app.');
      return;
    }
    const result = await payWithApplePay({ amount: 50, label: 'Restaurant Sponsorship' });
    if (result.ok) {
      await recordDonation({
        user_id: user?.id,
        amount: 50,
        recurring: false,
        method: 'apple_pay',
        source: 'restaurant_sponsorship',
        status: 'succeeded',
        created_at: new Date().toISOString(),
      });
      notify('Thank you!', 'Your $50 sponsorship has been processed.');
    }
  }

  function goPost() {
    if (!requireVerifiedId(user, navigation)) return;
    if (!profileComplete) {
      notifyThen(
        'Finish your profile first',
        'We need your address and business name before volunteers can find you.',
        () => navigation.navigate('RestaurantOnboarding'),
      );
      return;
    }
    navigation.navigate('ScheduleDonation');
  }

  const tools = [
    {
      key: 'schedule',
      icon: 'camera',
      title: 'Post surplus (60 sec)',
      desc: 'Snap a photo, pick a weight, post it. Volunteers claim it.',
      onPress: goPost,
    },
    {
      key: 'profile',
      icon: 'building',
      title: 'Restaurant profile',
      desc: 'Business name, address, hours, contact',
      onPress: () => navigation.navigate('RestaurantOnboarding'),
    },
    {
      key: 'history',
      icon: 'clipboard',
      title: 'Donation history',
      desc: 'Every pickup we ran, with weights and meal counts',
      onPress: () => navigation.navigate('DonationHistory'),
    },
    {
      key: 'receipts',
      icon: 'receipt',
      title: 'Tax receipts',
      desc: 'IRS-style receipts ready to email to your CPA',
      onPress: () => navigation.navigate('TaxReceipts'),
    },
    {
      key: 'settings',
      icon: 'settings',
      title: 'Settings',
      desc: 'Notifications, password, sign-out',
      onPress: () => navigation.navigate('Settings'),
    },
  ];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.green} />}
    >
      <ResponsiveContainer maxWidth={1100}>
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>Restaurant Partner</Text>
            <BrushText variant="screenTitle" style={styles.title}>
              {user?.business_name || user?.name || 'Welcome'}
            </BrushText>
            <Text style={styles.subtitle}>
              {profileComplete
                ? 'Post your next batch of surplus when you’re ready.'
                : 'Two minutes of setup and you’re live.'}
            </Text>
          </View>
          <TouchableOpacity onPress={handleSignOut} style={styles.signOutBtn}>
            <Text style={styles.signOut}>Sign out</Text>
          </TouchableOpacity>
        </View>

        {/* Onboarding banner — only shows until restaurant_complete flips */}
        {!profileComplete ? (
          <AnimatedPressable
            style={styles.banner}
            onPress={() => navigation.navigate('RestaurantOnboarding')}
            scaleTo={0.99}
          >
            <View style={styles.bannerIcon}>
              <Icon name="alert" size={20} color="#7A5400" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.bannerTitle}>Finish setting up your restaurant</Text>
              <Text style={styles.bannerBody}>
                Add your business name, address, and hours so volunteers can find you. Takes ~90 seconds.
              </Text>
            </View>
            <Icon name="chevron" size={20} color="#7A5400" />
          </AnimatedPressable>
        ) : null}

        {/* Quick stats */}
        <View style={styles.statsRow}>
          <StatCard number={String(history.length)} label="Donations" color={Colors.sage} style={styles.stat} />
          <StatCard number={String(meals)} label="Meals rescued" color={Colors.green} style={styles.stat} />
          <StatCard number={String(pickups.filter(p => p.status !== 'completed' && p.status !== 'cancelled').length)} label="Active posts" color={Colors.pink} style={styles.stat} />
        </View>

        {/* Big primary CTA — always one tap to post */}
        <AnimatedPressable style={styles.primaryCta} onPress={goPost}>
          <View style={styles.primaryCtaIcon}>
            <Icon name="camera" size={26} color={Colors.cream} strokeWidth={2.25} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.primaryCtaTitle}>Post surplus</Text>
            <Text style={styles.primaryCtaDesc}>Snap a photo → pick a weight → done. Volunteers claim within minutes.</Text>
          </View>
          <Icon name="forward" size={22} color={Colors.cream} />
        </AnimatedPressable>

        {/* Your recent posts */}
        <BrushText variant="sectionHeader" style={styles.sectionHeader}>
          Your recent posts
        </BrushText>

        {pickups.length === 0 ? (
          <View style={styles.empty}>
            <Icon name="clipboard" size={28} color={Colors.green} strokeWidth={1.5} />
            <Text style={styles.emptyTitle}>You haven’t posted yet</Text>
            <Text style={styles.emptyBody}>
              Tap “Post surplus” when you’ve got leftovers. We’ll route it to a volunteer at your nearest community fridge.
            </Text>
          </View>
        ) : (
          <View style={{ gap: 10, marginBottom: 28 }}>
            {pickups.map((p) => {
              const tone = STATUS_TONE[p.status] || STATUS_TONE.available;
              return (
                <AnimatedPressable
                  key={p.id}
                  scaleTo={0.99}
                  onPress={() => navigation.navigate('PickupDetail', { pickupId: p.id, pickup: p })}
                  style={styles.pickupRow}
                >
                  <View style={{ flex: 1 }}>
                    <View style={[styles.pill, { backgroundColor: tone.bg }]}>
                      <Text style={[styles.pillText, { color: tone.fg }]}>{tone.label}</Text>
                    </View>
                    <Text style={styles.pickupSummary} numberOfLines={1}>
                      {p.estimated_weight_lbs || '?'} lb · ~{Math.round((p.estimated_weight_lbs || 0) * 1.2)} meals
                      {p.fridge_name ? ` → ${p.fridge_name}` : ''}
                    </Text>
                    <Text style={styles.pickupMeta}>{prettyTime(p)}</Text>
                  </View>
                  <Icon name="chevron" size={18} color={Colors.grayMid} />
                </AnimatedPressable>
              );
            })}
          </View>
        )}

        {/* Sponsorship — wrapped in safe handlers now */}
        <AnimatedPressable
          style={styles.applePayCard}
          onPress={handleSponsorDonation}
        >
          <View style={styles.applePayLeft}>
            <Text style={styles.applePayGlyph}>Pay</Text>
            <View>
              <Text style={styles.applePayTitle}>Sponsor with Apple Pay</Text>
              <Text style={styles.applePayDesc}>Contribute $50 to your local chapter</Text>
            </View>
          </View>
          <Text style={styles.applePayArrow}>›</Text>
        </AnimatedPressable>

        {/* Secondary tools grid */}
        <BrushText variant="sectionHeader" style={styles.sectionHeader}>
          Manage
        </BrushText>

        <View style={[styles.toolGrid, isWide && styles.toolGridWide]}>
          {tools.map((t, i) => (
            <FadeInView key={t.key} delay={80 + i * 60} style={isWide ? styles.toolCardWide : null}>
              <AnimatedPressable
                style={styles.toolCard}
                onPress={t.onPress}
              >
                <View style={styles.toolIconWrap}>
                  <Icon name={t.icon} size={26} color={Colors.green} strokeWidth={2.25} />
                </View>
                <Text style={styles.toolTitle}>{t.title}</Text>
                <Text style={styles.toolDesc}>{t.desc}</Text>
              </AnimatedPressable>
            </FadeInView>
          ))}
        </View>
      </ResponsiveContainer>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  content: { padding: 24, paddingTop: 60, paddingBottom: 60 },
  header: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 18 },
  eyebrow: { fontSize: 12, color: Colors.sage, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  title: { color: Colors.green, marginTop: 4 },
  subtitle: { ...Type.body, color: Colors.gray, marginTop: 4 },
  signOutBtn: { paddingVertical: 6, paddingHorizontal: 10 },
  signOut: { fontSize: 13, color: Colors.pink, fontWeight: '600' },

  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#FFF2CF',
    borderRadius: Radius.lg,
    padding: 14,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#F4D58A',
  },
  bannerIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: 'rgba(122,84,0,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  bannerTitle: { fontWeight: '700', color: '#7A5400', fontSize: 14 },
  bannerBody: { ...Type.caption, color: '#7A5400', marginTop: 2 },

  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  stat: { flex: 1 },

  primaryCta: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: Colors.green,
    borderRadius: Radius.xl,
    padding: 20,
    marginBottom: 28,
    ...Shadows.card,
  },
  primaryCtaIcon: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center', justifyContent: 'center',
  },
  primaryCtaTitle: { color: Colors.cream, fontSize: 17, fontWeight: '800', letterSpacing: -0.2 },
  primaryCtaDesc: { color: 'rgba(247,244,240,0.85)', fontSize: 13, marginTop: 3 },

  sectionHeader: { color: Colors.green, marginBottom: 12 },

  empty: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: 22,
    alignItems: 'flex-start',
    gap: 6,
    marginBottom: 28,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: Colors.dark, marginTop: 8 },
  emptyBody: { ...Type.caption },

  pickupRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: 14,
    ...Shadows.soft,
  },
  pill: {
    alignSelf: 'flex-start',
    paddingVertical: 4, paddingHorizontal: 10,
    borderRadius: 99,
    marginBottom: 6,
  },
  pillText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  pickupSummary: { fontSize: 14, fontWeight: '600', color: Colors.dark },
  pickupMeta: { ...Type.caption, marginTop: 2 },

  applePayCard: {
    backgroundColor: '#000',
    borderRadius: Radius.lg,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 28,
    ...Shadows.card,
  },
  applePayLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  applePayGlyph: { fontSize: 22, fontWeight: '700', color: '#fff', fontStyle: 'italic', marginRight: 16, letterSpacing: -0.5 },
  applePayTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  applePayDesc: { color: '#C8DDD4', fontSize: 13, marginTop: 2 },
  applePayArrow: { color: '#fff', fontSize: 26 },

  toolGrid: { flexDirection: 'column', gap: 12 },
  toolGridWide: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  toolCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: 20,
    ...Shadows.card,
  },
  toolCardWide: { flexBasis: '31%', flexGrow: 1, minWidth: 240 },
  toolIconWrap: {
    width: 48, height: 48, borderRadius: 12,
    backgroundColor: Colors.greenLight,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
  },
  toolTitle: { fontSize: 16, fontWeight: '700', color: Colors.dark },
  toolDesc: { ...Type.caption, marginTop: 4 },
});
