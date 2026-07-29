// Restaurant / partner home — direction v1.
//
// State-adaptive hero (same pattern as the member dashboard):
//   Onboarding needed → hero = finish setup
//   Handoff pending   → hero = confirm a volunteer who's arrived
//   Otherwise         → hero = Post surplus (welcoming when brand-new,
//                        celebratory once they have history)
//
// Then supporting content in this order:
//   - Recent posts (compact, chronological, with pickup status)
//   - Impact strip (lbs / meals / family-days across all completed posts)
//   - "Sponsor your chapter" — moved OUT of the middle of the operational
//     flow to the bottom (partners open the app to post, not to donate)
//   - Manage tools (settings, receipts, history, profile) as quieter
//     secondary access
//
// Copy adapts to partner_type — a church garden reads "Community Garden"
// everywhere it used to say "Restaurant".
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, RefreshControl, Platform, Linking } from 'react-native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import ResponsiveContainer from '../../components/ui/ResponsiveContainer';
import useBreakpoint from '../../hooks/useBreakpoint';
import useAuthStore from '../../store/authStore';
import { signOut } from '../../services/auth';
import DonationCTA from '../../components/donate/DonationCTA';
import ContractGate from '../../components/ui/ContractGate';
import RestaurantApprovalGate from '../../components/ui/RestaurantApprovalGate';
import { partnerTypeFor } from '../../config/partnerTypes';
import {
  fetchDonationHistory, fetchPickupsByRestaurant, verifyPickupByRestaurant,
} from '../../services/database';
import { requireVerifiedId } from '../../services/idGate';
import { notify, notifyThen, confirm } from '../../services/ui';
import Icon from '../../components/ui/Icon';
import Screen from '../../components/ui/Screen';
import { mealsFromLbs, familyDaysFromLbs } from '../../services/impact';
import WorkspaceChip from '../../components/ui/WorkspaceChip';

// Warm serif — hero numbers + hero primary lines. See member dashboard
// for the rationale; must match visually across the four dashboards.
const SERIF = Platform.select({
  ios: 'Georgia',
  android: 'serif',
  default: 'Georgia, "Iowan Old Style", "Palatino Linotype", serif',
});

const STATUS_TONE = {
  available: { bg: '#FFF2CF', fg: '#7A5400', label: 'Waiting on a volunteer' },
  claimed:   { bg: '#E5F2EC', fg: '#1B5E3F', label: 'Volunteer claimed' },
  enroute:   { bg: '#E1EDFA', fg: '#1565C0', label: 'On the way to fridge' },
  completed: { bg: '#DFF1E2', fg: '#2E7D32', label: 'Delivered' },
  cancelled: { bg: '#F8DADA', fg: '#8E1B1B', label: 'Cancelled' },
};
const VERIFIED_TONE = { bg: '#E8E1F4', fg: '#5B3A8E', label: '✓ Picked up — heading to drop-off' };
function toneFor(p) {
  if (p.status === 'completed' || p.status === 'cancelled') return STATUS_TONE[p.status];
  if (p.verified_by_restaurant_at) return VERIFIED_TONE;
  return STATUS_TONE[p.status] || STATUS_TONE.available;
}
function prettyTime(p) {
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
  const { isDesktop } = useBreakpoint();
  const [history, setHistory] = useState([]);
  const [pickups, setPickups] = useState([]);
  const [totalLbs, setTotalLbs] = useState(0);
  const [verifyingId, setVerifyingId] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const restaurantId = user?.restaurant_id || user?.id;
  const profileComplete = user?.restaurant_complete || !!(user?.address && user?.name);
  const partnerType = partnerTypeFor(user?.partner_type);
  const orgName = user?.business_name || user?.organization_name || user?.name || 'Welcome';

  const load = useCallback(async () => {
    try {
      const [hist, pks] = await Promise.all([
        fetchDonationHistory(restaurantId).catch(() => []),
        fetchPickupsByRestaurant(restaurantId, 8).catch(() => []),
      ]);
      setHistory(hist);
      setPickups(pks);
      const lbs = pks
        .filter((p) => p.status === 'completed')
        .reduce((s, p) => s + (p.actual_weight_lbs || p.estimated_weight_lbs || 0), 0);
      setTotalLbs(Math.round(lbs));
    } catch {}
  }, [restaurantId]);
  useEffect(() => { load(); }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }
  async function handleSignOut() {
    const ok = await confirm('Sign Out', 'Sign out of the partner portal?');
    if (!ok) return;
    try { await signOut(); } catch {}
    clearAuth();
  }
  async function handleConfirmPickup(p) {
    const ok = await confirm(
      'Confirm pickup?',
      `Confirm that the volunteer has picked up the food. They'll mark it delivered once they reach the drop-off.`,
    );
    if (!ok) return;
    setVerifyingId(p.id);
    try {
      await verifyPickupByRestaurant(p.id, user?.id);
      setPickups((prev) => prev.map((pk) =>
        pk.id === p.id ? { ...pk, verified_by_restaurant_at: new Date().toISOString() } : pk
      ));
      notify('Pickup confirmed', 'The volunteer is now en route to the drop-off.');
    } catch (e) {
      notify('Could not confirm', e?.message || 'Try again.');
    } finally { setVerifyingId(null); }
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

  // ── State detection ───────────────────────────────────────────────
  const needsConfirm = pickups.filter(
    (p) => (p.status === 'claimed' || p.status === 'enroute') && !p.verified_by_restaurant_at
  );
  const activePosts = pickups.filter(
    (p) => p.status !== 'completed' && p.status !== 'cancelled'
  );
  const state = !profileComplete       ? 'setup'
              : needsConfirm.length > 0 ? 'confirm'
              : (history.length === 0 && pickups.length === 0) ? 'brandnew'
              : 'ready';

  return (
    <RestaurantApprovalGate>
    <ContractGate kind="restaurant">
    <Screen
      contentStyle={[styles.content, isDesktop && styles.contentDesktop]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.green} />}
    >
      <ResponsiveContainer maxWidth={720}>
        <WorkspaceChip
          user={user}
          workspaceName={orgName}
          scope="partner"
        />
        <IdentityStrip
          eyebrow={`${partnerType.label} partner`}
          name={orgName}
          avatarInitial={(orgName || '?')[0].toUpperCase()}
          onSignOut={handleSignOut}
        />

        {state === 'setup' && (
          <HeroSetup onFinish={() => navigation.navigate('RestaurantOnboarding')} partnerType={partnerType} />
        )}
        {state === 'confirm' && (
          <HeroConfirm
            pickup={needsConfirm[0]}
            moreCount={needsConfirm.length - 1}
            busy={verifyingId === needsConfirm[0]?.id}
            onConfirm={() => handleConfirmPickup(needsConfirm[0])}
          />
        )}
        {state === 'brandnew' && (
          <HeroFirstPost partnerType={partnerType} onPost={goPost} />
        )}
        {state === 'ready' && (
          <HeroPost
            totalLbs={totalLbs}
            historyCount={history.length}
            activeCount={activePosts.length}
            onPost={goPost}
          />
        )}

        {/* Supporting content — recent posts + impact + tools */}
        {(pickups.length > 0) && (
          <RecentPostsCard
            pickups={pickups.slice(0, 4)}
            navigation={navigation}
            onConfirm={handleConfirmPickup}
            verifyingId={verifyingId}
          />
        )}

        {totalLbs > 0 && <ImpactStrip lbs={totalLbs} />}

        <ManageTools navigation={navigation} />

        <SponsorCard />
      </ResponsiveContainer>
    </Screen>
    </ContractGate>
    </RestaurantApprovalGate>
  );
}

// ── IdentityStrip (partner variant — no bell, sign-out on the right) ─
function IdentityStrip({ eyebrow, name, avatarInitial, onSignOut }) {
  return (
    <View style={styles.idStrip}>
      <View style={styles.avatar}><Text style={styles.avatarText}>{avatarInitial}</Text></View>
      <View style={styles.greeting}>
        <Text style={styles.greetingK}>{eyebrow}</Text>
        <Text style={styles.greetingT} numberOfLines={1}>{name}</Text>
      </View>
      <TouchableOpacity onPress={onSignOut} style={styles.signOutBtn}>
        <Text style={styles.signOutTxt}>Sign out</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Hero: setup ─────────────────────────────────────────────────────
function HeroSetup({ onFinish, partnerType }) {
  return (
    <View style={[styles.hero, styles.heroSetup]}>
      <View style={styles.heroEyebrowRow}>
        <View style={[styles.chip, styles.chipWarn]}>
          <Text style={styles.chipTextWarn}>Setup required</Text>
        </View>
      </View>
      <Text style={styles.heroPrimary}>Two minutes and your {partnerType.singular} is live.</Text>
      <Text style={styles.heroSecondary}>
        Add your address, hours, and contact so volunteers know where to go.
      </Text>
      <TouchableOpacity style={styles.btnPrimary} onPress={onFinish} activeOpacity={0.88}>
        <Text style={styles.btnPrimaryText}>Finish setup →</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Hero: confirm handoff ──────────────────────────────────────────
function HeroConfirm({ pickup, moreCount, busy, onConfirm }) {
  if (!pickup) return null;
  return (
    <View style={[styles.hero, styles.heroConfirm]}>
      <View style={styles.heroEyebrowRow}>
        <View style={[styles.chip, styles.chipDanger]}>
          <Text style={styles.chipTextDanger}>Action required</Text>
        </View>
        <Text style={styles.heroMeta}>{prettyTime(pickup)}</Text>
      </View>
      <Text style={styles.heroPrimary}>
        {pickup.claimant_name || 'A volunteer'} came to pick up your
        {pickup.estimated_weight_lbs ? ` ${pickup.estimated_weight_lbs}-lb ` : ' '}post.
      </Text>
      <Text style={styles.heroSecondary}>
        Tap Confirm the moment they've loaded it in — their volunteer hours start counting from here.
        {moreCount > 0 ? ` (${moreCount} more waiting below.)` : ''}
      </Text>
      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={[styles.btnPrimary, styles.btnDanger]}
          onPress={onConfirm}
          disabled={busy}
          activeOpacity={0.88}
        >
          <Text style={styles.btnPrimaryText}>
            {busy ? 'Confirming…' : 'Confirm pickup happened'}
          </Text>
        </TouchableOpacity>
        {pickup.claimant_phone && (
          <TouchableOpacity
            style={[styles.btnGhost, styles.btnGhostDanger]}
            onPress={() => Linking.openURL(`tel:${pickup.claimant_phone}`).catch(() => {})}
            activeOpacity={0.88}
          >
            <Icon name="phone" size={14} color="#8E1B1B" />
            <Text style={[styles.btnGhostText, { color: '#8E1B1B' }]}>Call</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ── Hero: first post welcome ───────────────────────────────────────
function HeroFirstPost({ partnerType, onPost }) {
  return (
    <View style={[styles.hero, styles.heroWelcome]}>
      <Text style={styles.heroQuietEyebrow}>Ready when you are</Text>
      <Text style={styles.heroQuietNum}>Post your first surplus.</Text>
      <Text style={styles.heroQuietBody}>
        Snap a photo, pick a weight, pick a window. A volunteer at the nearest chapter claims it and comes
        to pick it up — free, weighed, and tax-receipted for your {partnerType.possessive}.
      </Text>
      <TouchableOpacity style={styles.btnWarm} onPress={onPost} activeOpacity={0.88}>
        <Text style={styles.btnWarmText}>Post surplus →</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Hero: ready to post (with history) ────────────────────────────
function HeroPost({ totalLbs, historyCount, activeCount, onPost }) {
  return (
    <View style={styles.hero}>
      <View style={styles.heroEyebrowRow}>
        <View style={[styles.chip, styles.chipProgress]}>
          <View style={styles.chipDot} />
          <Text style={styles.chipTextProgress}>Post surplus</Text>
        </View>
        {activeCount > 0 && (
          <Text style={styles.heroMeta}>
            {activeCount} active post{activeCount === 1 ? '' : 's'}
          </Text>
        )}
      </View>
      <Text style={styles.heroPrimary}>
        {totalLbs > 0
          ? `You've rescued ${totalLbs.toLocaleString('en-US')} lbs so far.`
          : 'Have leftover food today?'}
      </Text>
      <Text style={styles.heroSecondary}>
        {totalLbs > 0
          ? `That's about ${mealsFromLbs(totalLbs).toLocaleString('en-US')} meals across ${historyCount || pluralize(historyCount, 'post', 'posts')} — post the next one when you're ready.`
          : 'Post surplus in about a minute and a volunteer picks it up. Every pound is weighed and receipted.'}
      </Text>
      <TouchableOpacity style={styles.btnPrimary} onPress={onPost} activeOpacity={0.88}>
        <Text style={styles.btnPrimaryText}>Post surplus →</Text>
      </TouchableOpacity>
    </View>
  );
}
function pluralize(n, single, plural) { return `${n} ${n === 1 ? single : plural}`; }

// ── Recent posts card ──────────────────────────────────────────────
function RecentPostsCard({ pickups, navigation, onConfirm, verifyingId }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardEyebrow}>Your recent posts</Text>
      <View style={{ marginTop: 6 }}>
        {pickups.map((p, i) => {
          const tone = toneFor(p);
          const canConfirm = (p.status === 'claimed' || p.status === 'enroute') && !p.verified_by_restaurant_at;
          const isDelivered = p.status === 'completed';
          return (
            <View key={p.id} style={[styles.recentRow, i > 0 && styles.recentRowBorder]}>
              <TouchableOpacity
                style={styles.recentBody}
                activeOpacity={0.85}
                onPress={() => navigation.navigate('PickupDetail', { pickupId: p.id, pickup: p })}
              >
                <View style={[styles.pill, { backgroundColor: tone.bg }]}>
                  <Text style={[styles.pillText, { color: tone.fg }]}>{tone.label}</Text>
                </View>
                <Text style={styles.recentTitle} numberOfLines={1}>
                  {p.estimated_weight_lbs || '?'} lb · ~{Math.round((p.estimated_weight_lbs || 0) * 1.2)} meals
                  {p.fridge_name ? ` → ${p.fridge_name}` : ''}
                </Text>
                <Text style={styles.recentMeta}>{prettyTime(p)}</Text>
              </TouchableOpacity>
              {canConfirm && (
                <TouchableOpacity
                  onPress={() => onConfirm(p)}
                  disabled={verifyingId === p.id}
                  style={styles.recentConfirmBtn}
                  activeOpacity={0.85}
                >
                  <Text style={styles.recentConfirmText}>
                    {verifyingId === p.id ? 'Confirming…' : 'Confirm handoff'}
                  </Text>
                </TouchableOpacity>
              )}
              {isDelivered && p.tax_receipt_url && (
                <TouchableOpacity
                  style={styles.recentReceipt}
                  activeOpacity={0.85}
                  onPress={() => {
                    if (typeof window !== 'undefined' && window.open) {
                      window.open(p.tax_receipt_url, '_blank', 'noopener,noreferrer');
                    } else {
                      Linking.openURL(p.tax_receipt_url).catch(() => {});
                    }
                  }}
                >
                  <Icon name="receipt" size={14} color="#065F46" />
                  <Text style={styles.recentReceiptText}>Tax receipt ready</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ── Impact strip ────────────────────────────────────────────────────
function ImpactStrip({ lbs }) {
  if (!lbs || lbs <= 0) return null;
  const meals = mealsFromLbs(lbs);
  const families = familyDaysFromLbs(lbs);
  return (
    <View style={styles.impactStrip}>
      <View style={styles.impactCell}>
        <Text style={styles.impactNum}>{lbs.toLocaleString('en-US')}</Text>
        <Text style={styles.impactLabel}>Lbs donated</Text>
      </View>
      <View style={styles.impactDivider} />
      <View style={styles.impactCell}>
        <Text style={styles.impactNum}>{meals.toLocaleString('en-US')}</Text>
        <Text style={styles.impactLabel}>Meals</Text>
      </View>
      <View style={styles.impactDivider} />
      <View style={styles.impactCell}>
        <Text style={styles.impactNum}>{families.toLocaleString('en-US')}</Text>
        <Text style={styles.impactLabel}>Family-days</Text>
      </View>
    </View>
  );
}

// ── Manage tools (quiet secondary access) ──────────────────────────
function ManageTools({ navigation }) {
  const tools = [
    { key: 'profile',  icon: 'building', title: 'Business profile',    to: 'RestaurantOnboarding' },
    { key: 'history',  icon: 'clipboard', title: 'Donation history',    to: 'DonationHistory' },
    { key: 'receipts', icon: 'receipt',   title: 'Tax receipts',        to: 'TaxReceipts' },
    { key: 'settings', icon: 'settings',  title: 'Settings',            to: 'Settings' },
  ];
  return (
    <View style={styles.toolsCard}>
      <Text style={styles.cardEyebrow}>Manage</Text>
      <View style={styles.toolsRow}>
        {tools.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={styles.toolItem}
            activeOpacity={0.85}
            onPress={() => navigation.navigate(t.to)}
          >
            <View style={styles.toolIcon}>
              <Icon name={t.icon} size={18} color={Colors.green} strokeWidth={2} />
            </View>
            <Text style={styles.toolLabel}>{t.title}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// ── Sponsor card — moved to the bottom ─────────────────────────────
function SponsorCard() {
  return (
    <View style={styles.sponsorCard}>
      <Text style={styles.cardEyebrow}>Support your chapter</Text>
      <Text style={styles.sponsorTitle}>Sponsor the volunteers who move your food.</Text>
      <DonationCTA amount={50} label="Sponsor your chapter" />
    </View>
  );
}

// ── Styles (shares idiom with member DashboardScreen) ─────────────
const styles = StyleSheet.create({
  content: { padding: 20, paddingTop: 60, paddingBottom: 60, gap: 12 },
  contentDesktop: { paddingHorizontal: 40, maxWidth: 720, alignSelf: 'center', width: '100%' },

  // Identity
  idStrip: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.green,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: Colors.cream, fontFamily: SERIF, fontSize: 16, fontWeight: '500' },
  greeting: { flex: 1, minWidth: 0 },
  greetingK: { fontSize: 12, color: Colors.gray },
  greetingT: { fontSize: 16, fontWeight: '600', color: Colors.dark, marginTop: 1 },
  signOutBtn: { paddingVertical: 6, paddingHorizontal: 10 },
  signOutTxt: { fontSize: 13, color: Colors.pink, fontWeight: '600' },

  // Hero — shared
  hero: {
    backgroundColor: Colors.white,
    borderRadius: 22, padding: 20,
    borderWidth: 1, borderColor: Colors.glassBorder,
    gap: 12, marginTop: 6,
  },
  heroSetup: { backgroundColor: '#FFF9EC', borderColor: '#F4D58A' },
  heroConfirm: { backgroundColor: '#FCE3E3', borderColor: '#F5B5B5' },
  heroWelcome: { backgroundColor: Colors.green, borderColor: 'transparent' },
  heroEyebrowRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: 8, flexWrap: 'wrap',
  },
  heroPrimary: {
    fontFamily: SERIF,
    fontSize: 22, lineHeight: 28,
    color: Colors.dark, fontWeight: '500',
    letterSpacing: -0.2,
  },
  heroSecondary: {
    fontSize: 14, color: Colors.gray, lineHeight: 20, marginTop: -6,
  },
  heroMeta: { fontSize: 12, color: Colors.gray, fontWeight: '600' },
  heroQuietEyebrow: {
    fontSize: 10.5, fontWeight: '800', letterSpacing: 1.4,
    textTransform: 'uppercase', color: 'rgba(255,255,255,0.62)',
  },
  heroQuietNum: {
    fontFamily: SERIF,
    fontSize: 30, lineHeight: 34,
    fontWeight: '500', letterSpacing: -0.4,
    color: Colors.cream, marginTop: 4,
  },
  heroQuietBody: {
    fontSize: 14.5, lineHeight: 21,
    color: 'rgba(255,255,255,0.85)', marginTop: 6,
  },

  // Chips
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 999 },
  chipDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.green },
  chipProgress: { backgroundColor: Colors.greenLight },
  chipTextProgress: { fontSize: 10.5, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', color: Colors.green },
  chipWarn: { backgroundColor: 'rgba(122,84,0,0.14)' },
  chipTextWarn: { fontSize: 10.5, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', color: '#7A5400' },
  chipDanger: { backgroundColor: 'rgba(142,27,27,0.14)' },
  chipTextDanger: { fontSize: 10.5, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', color: '#8E1B1B' },

  // Buttons
  actionsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  btnPrimary: {
    backgroundColor: Colors.green,
    paddingVertical: 13, paddingHorizontal: 18,
    borderRadius: 14, alignItems: 'center',
    flexGrow: 1, minWidth: 160,
  },
  btnPrimaryText: { color: Colors.cream, fontSize: 14.5, fontWeight: '700' },
  btnDanger: { backgroundColor: '#8E1B1B' },
  btnGhost: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1, borderColor: Colors.green + '33',
  },
  btnGhostDanger: { borderColor: '#8E1B1B' },
  btnGhostText: { color: Colors.green, fontSize: 13.5, fontWeight: '700' },
  btnWarm: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.pink,
    paddingVertical: 11, paddingHorizontal: 18,
    borderRadius: 14, marginTop: 4,
  },
  btnWarmText: { color: '#FFF', fontSize: 14, fontWeight: '700' },

  // Cards + rows
  card: {
    backgroundColor: Colors.white, borderRadius: 18, padding: 16,
    borderWidth: 1, borderColor: Colors.glassBorder,
  },
  cardEyebrow: {
    fontSize: 10.5, fontWeight: '800', letterSpacing: 1.4,
    textTransform: 'uppercase', color: Colors.gray, marginBottom: 6,
  },

  recentRow: { paddingVertical: 10, gap: 6 },
  recentRowBorder: { borderTopWidth: 0.5, borderTopColor: Colors.glassBorder },
  recentBody: { gap: 4 },
  pill: { alignSelf: 'flex-start', paddingVertical: 4, paddingHorizontal: 10, borderRadius: 99 },
  pillText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  recentTitle: { fontSize: 14, fontWeight: '600', color: Colors.dark },
  recentMeta: { fontSize: 12, color: Colors.gray, marginTop: 2 },
  recentConfirmBtn: {
    marginTop: 4, backgroundColor: '#5B3A8E',
    paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10,
    alignItems: 'center',
  },
  recentConfirmText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  recentReceipt: {
    marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10,
    backgroundColor: '#E8F5EE', borderWidth: 1, borderColor: '#A7F3D0',
    alignSelf: 'flex-start',
  },
  recentReceiptText: { color: '#065F46', fontWeight: '700', fontSize: 12.5 },

  // Impact
  impactStrip: {
    backgroundColor: Colors.white, borderRadius: 18,
    borderWidth: 1, borderColor: Colors.glassBorder,
    padding: 16, flexDirection: 'row', alignItems: 'center',
  },
  impactCell: { flex: 1, alignItems: 'center' },
  impactNum: {
    fontFamily: SERIF,
    fontSize: 26, lineHeight: 28,
    color: Colors.dark, fontWeight: '500', letterSpacing: -0.4,
  },
  impactLabel: {
    fontSize: 11, fontWeight: '600', color: Colors.gray,
    marginTop: 6, letterSpacing: 0.3, textAlign: 'center',
  },
  impactDivider: { width: 1, height: 30, backgroundColor: Colors.glassBorder },

  // Tools
  toolsCard: {
    backgroundColor: Colors.white, borderRadius: 18, padding: 16,
    borderWidth: 1, borderColor: Colors.glassBorder,
  },
  toolsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  toolItem: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 8, paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1, borderColor: Colors.glassBorder,
    minWidth: '47%',
  },
  toolIcon: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: Colors.greenLight,
    alignItems: 'center', justifyContent: 'center',
  },
  toolLabel: { fontSize: 13.5, fontWeight: '600', color: Colors.dark, flex: 1 },

  // Sponsor
  sponsorCard: {
    backgroundColor: '#FFF9EC', borderRadius: 18, padding: 16,
    borderLeftWidth: 4, borderLeftColor: '#E0A52F',
    gap: 8,
  },
  sponsorTitle: { fontSize: 15, fontWeight: '700', color: Colors.dark, marginTop: 2, letterSpacing: -0.15 },
});
