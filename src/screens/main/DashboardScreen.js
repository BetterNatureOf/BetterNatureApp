// Home / Dashboard — direction v1 (member/volunteer).
//
// The screen adapts to what the volunteer is actually doing right now
// instead of showing the same stats-first layout every time:
//   State 1 · on a run     → hero = the claimed pickup (countdown, route, resume CTA)
//   State 2 · pickup ready → hero = the newest available pickup + claim
//   State 3 · quiet moment → hero = a warm impact card so a new/quiet day
//                             doesn't greet the user with a wall of zeros
//
// Impact numbers are set in a serif face used only where the numbers
// should *feel* different from the chrome — Georgia stack, keeps the
// warmth without loading a webfont.
//
// Partner tools, the first-time checklist, and the projects/events
// blocks live below the hero as quieter secondary content — always
// reachable, never in the way.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import useAuthStore from '../../store/authStore';
import useNotifStore from '../../store/notifStore';
import ProjectCards from '../../components/sections/ProjectCards';
import UpcomingEvents from '../../components/sections/UpcomingEvents';
import DonateCard from '../../components/sections/DonateCard';
import Icon from '../../components/ui/Icon';
import Screen from '../../components/ui/Screen';
import useResponsiveLayout from '../../hooks/useResponsiveLayout';
import useEvents from '../../hooks/useEvents';
import usePickups from '../../hooks/usePickups';
import { confirm } from '../../services/ui';
import { getProfile } from '../../services/auth';
import { ensureMyPartnerRecord, fetchRecentlyCompletedPickups } from '../../services/database';
import { mealsFromLbs, familyDaysFromLbs } from '../../services/impact';
import PickupCountdown from '../../components/pickup/PickupCountdown';
import { openInMaps, formatAddress } from '../../services/maps';
import WorkspaceChip from '../../components/ui/WorkspaceChip';

// ── Warm serif stack ────────────────────────────────────────────────
// Used only on hero numbers + hero primary lines so those moments
// feel human instead of leaderboard-flat. Everything else stays sans.
const SERIF = Platform.select({
  ios: 'Georgia',
  android: 'serif',
  default: 'Georgia, "Iowan Old Style", "Palatino Linotype", serif',
});

// ── Greeting helpers ────────────────────────────────────────────────
function timeOfDayGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning,';
  if (h < 17) return 'Hi';
  if (h < 22) return 'Good evening,';
  return 'Hey';
}
function firstName(user) {
  return (user?.name || 'Friend').split(' ')[0];
}

// ── Chapter-pulse fetch ─────────────────────────────────────────────
// One extra Firestore query on the dashboard — bounded to the user's
// chapter, cached in state, and refreshed only on focus. Powers the
// "This week · Memphis" list on state 2 so the app never feels empty
// even when the volunteer's own inbox is quiet.
function useChapterPulse(chapterId, refreshKey) {
  const [pulse, setPulse] = useState([]);
  useEffect(() => {
    if (!chapterId) { setPulse([]); return; }
    let alive = true;
    fetchRecentlyCompletedPickups({ chapterId, hours: 24 * 7 })
      .then((rows) => { if (alive) setPulse(rows.slice(0, 3)); })
      .catch(() => { if (alive) setPulse([]); });
    return () => { alive = false; };
  }, [chapterId, refreshKey]);
  return pulse;
}

export default function DashboardScreen({ navigation }) {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const unreadCount = useNotifStore((s) => s.unreadCount);
  const [focusTick, setFocusTick] = useState(0);

  // Re-pull the user doc on every tab focus so lbs_rescued / hours
  // reflect post-pickup bumps without forcing sign-out/sign-in.
  // Also self-heals a partner user's /restaurants doc if missing.
  useFocusEffect(useCallback(() => {
    if (!user?.id) return;
    setFocusTick((n) => n + 1);
    (async () => {
      const isPartnerRole = user?.role === 'restaurant'
        || (Array.isArray(user?.roles) && user.roles.includes('partner'));
      if (isPartnerRole && !user?.restaurant_id) {
        try { await ensureMyPartnerRecord(user); } catch {}
      }
      try {
        const fresh = await getProfile(user.id);
        if (fresh && setUser) setUser({ ...user, ...fresh });
      } catch {}
    })();
  }, [user?.id]));

  const { events } = useEvents();
  const { pickups, claim } = usePickups();
  const chapterPulse = useChapterPulse(user?.chapter_id, focusTick);
  const { contentStyle } = useResponsiveLayout();

  const active = useMemo(() => pickups.filter(
    (p) => p.claimed_by === user?.id && ['claimed', 'enroute'].includes(p.status)
  ), [pickups, user?.id]);

  const available = useMemo(() => pickups.filter(
    (p) => p.status === 'available'
  ), [pickups]);

  const state = active.length > 0 ? 'active'
              : available.length > 0 ? 'available'
              : 'quiet';

  async function handleClaimPickup(pickup) {
    const ok = await confirm(
      'Claim Pickup',
      `Claim the pickup from ${pickup.restaurant_name}?`
    );
    if (!ok) return;
    try { await claim(pickup.id); } catch {}
  }

  const isPartner = user?.role === 'restaurant'
    || (Array.isArray(user?.roles) && user.roles.includes('partner'));
  const isNewMember = !user?.events_attended && !user?.meals_rescued && !user?.hours_logged;
  const userLbs = user?.lbs_rescued || Math.round((user?.meals_rescued || 0) / 1.2) || 0;

  const heroGreeting = state === 'active' ? 'Halfway there,' : timeOfDayGreeting();

  return (
    <Screen contentStyle={contentStyle}>
      <WorkspaceChip user={user} scope="chapter" />
      <IdentityStrip
        greeting={heroGreeting}
        name={firstName(user)}
        avatarInitial={(user?.name || '?')[0].toUpperCase()}
        unreadCount={unreadCount}
        onNotifPress={() => navigation.navigate('Notifications')}
      />

      {/* Hero — adapts to state */}
      {state === 'active' && (
        <HeroActive
          pickup={active[0]}
          onOpen={() => navigation.navigate('PickupDetail', { pickupId: active[0].id, pickup: active[0] })}
        />
      )}
      {state === 'available' && (
        <HeroAvailable
          pickup={available[0]}
          extraCount={available.length - 1}
          onClaim={() => handleClaimPickup(available[0])}
          onOpen={() => navigation.navigate('PickupDetail', { pickupId: available[0].id, pickup: available[0] })}
        />
      )}
      {state === 'quiet' && (
        <HeroQuiet
          userLbs={userLbs}
          chapterName={user?.chapter?.name || user?.chapter_name}
          personalPickups={user?.pickups_completed || 0}
          onOpenEvents={() => navigation.navigate('Iris')}
        />
      )}

      {/* Supporting content — varies with state */}
      {state === 'active' && (
        <ChapterToday
          pulse={chapterPulse}
          chapterName={user?.chapter?.name || user?.chapter_name}
        />
      )}
      {state === 'available' && (
        <>
          <ImpactStrip lbs={userLbs} />
          <ChapterPulseCard pulse={chapterPulse} chapterName={user?.chapter?.name || user?.chapter_name} />
        </>
      )}
      {state === 'quiet' && (
        <UpcomingEvents
          events={events}
          onEventPress={(event) => navigation.navigate('EventDetail', { event })}
        />
      )}

      {/* Partner shortcut — quiet, always available if applicable */}
      {isPartner && (
        <PartnerShortcut
          onPost={() => navigation.navigate('ScheduleDonation')}
          onHistory={() => navigation.navigate('DonationHistory')}
        />
      )}

      {/* First-time checklist — below the fold */}
      {isNewMember && (
        <NewMemberChecklist
          verified={!!user?.id_document_url}
          profileComplete={!!user?.profile_complete}
          navigate={navigation.navigate}
        />
      )}

      {/* Everything else — always at the bottom */}
      <ProjectCards onPress={(project) => navigation.navigate('ProjectDetail', { project })} />
      <View style={{ height: 12 }} />
      <DonateCard onPress={() => navigation.navigate('Donate')} />
    </Screen>
  );
}

// ── IdentityStrip ───────────────────────────────────────────────────
function IdentityStrip({ greeting, name, avatarInitial, unreadCount, onNotifPress }) {
  return (
    <View style={styles.idStrip}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{avatarInitial}</Text>
      </View>
      <View style={styles.greeting}>
        <Text style={styles.greetingK}>{greeting}</Text>
        <Text style={styles.greetingT} numberOfLines={1}>{name}</Text>
      </View>
      <TouchableOpacity
        onPress={onNotifPress}
        style={styles.bell}
        accessibilityLabel={unreadCount > 0 ? `${unreadCount} unread notifications` : 'Notifications'}
      >
        <Icon name="bell" size={16} color={Colors.dark} strokeWidth={1.8} />
        {unreadCount > 0 && <View style={styles.bellDot} />}
      </TouchableOpacity>
    </View>
  );
}

// ── Hero: on a run ──────────────────────────────────────────────────
function HeroActive({ pickup, onOpen }) {
  if (!pickup) return null;
  const restAddr = pickup.restaurant_address || formatAddress({
    street: pickup.restaurant_street,
    city: pickup.restaurant_city,
    state: pickup.restaurant_state,
    zip: pickup.restaurant_zip,
  });
  const dropTarget = pickup.status === 'enroute'
    ? (pickup.fridge_name || 'Chosen fridge')
    : (pickup.fridge_name || 'You choose on arrival');
  const primaryLabel = pickup.status === 'enroute' ? 'Complete drop-off →' : 'Continue pickup →';
  const primaryPickup = pickup.restaurant_name || 'This pickup';
  const primaryText = pickup.estimated_weight_lbs
    ? `${primaryPickup} has ${pickup.estimated_weight_lbs} lbs ready.`
    : `${primaryPickup} is waiting on you.`;

  return (
    <View style={styles.hero}>
      <View style={styles.heroEyebrowRow}>
        <View style={[styles.chip, styles.chipProgress]}>
          <View style={styles.chipDot} />
          <Text style={styles.chipTextProgress}>On a run</Text>
        </View>
        <PickupCountdown pickup={pickup} />
      </View>

      <Text style={styles.heroPrimary}>{primaryText}</Text>

      <View style={styles.routeGrid}>
        <View style={styles.routeRail}>
          <View style={styles.routeDot} />
          <View style={styles.routeLine} />
          <View style={[styles.routeDot, styles.routeDotOutline]} />
        </View>
        <View style={styles.routeCols}>
          <View style={styles.routeStop}>
            <Text style={styles.routeLabel}>PICK UP</Text>
            <Text style={styles.routePlace} numberOfLines={2}>
              {pickup.restaurant_name || 'Restaurant'}{restAddr ? ` · ${restAddr}` : ''}
            </Text>
          </View>
          <View style={styles.routeStop}>
            <Text style={styles.routeLabel}>DROP OFF</Text>
            <Text style={styles.routePlace} numberOfLines={2}>{dropTarget}</Text>
          </View>
        </View>
      </View>

      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.btnPrimary} onPress={onOpen} activeOpacity={0.88}>
          <Text style={styles.btnPrimaryText}>{primaryLabel}</Text>
        </TouchableOpacity>
        {restAddr && (
          <TouchableOpacity
            style={styles.btnGhost}
            activeOpacity={0.88}
            onPress={() => openInMaps({
              address: restAddr,
              lat: pickup.restaurant_lat,
              lng: pickup.restaurant_lng,
              label: pickup.restaurant_name,
            })}
          >
            <Icon name="pin" size={14} color={Colors.green} />
            <Text style={styles.btnGhostText}>Maps</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ── Hero: pickup available ─────────────────────────────────────────
function HeroAvailable({ pickup, extraCount, onClaim, onOpen }) {
  if (!pickup) return null;
  const meals = mealsFromLbs(pickup.estimated_weight_lbs || 0);
  const families = familyDaysFromLbs(pickup.estimated_weight_lbs || 0);
  const primary = pickup.restaurant_name || 'A partner';
  const primaryText = pickup.estimated_weight_lbs
    ? `${primary} just posted ${pickup.estimated_weight_lbs} lbs.`
    : `${primary} has a pickup ready.`;
  const bits = [];
  if (meals)    bits.push(`about ${meals} meals`);
  if (families) bits.push(`feeds ~${families} famil${families === 1 ? 'y' : 'ies'} for a day`);
  const sub = bits.join(' · ');

  return (
    <View style={styles.hero}>
      <View style={styles.heroEyebrowRow}>
        <View style={[styles.chip, styles.chipNew]}>
          <Text style={styles.chipTextNew}>New pickup</Text>
        </View>
        <PickupCountdown pickup={pickup} />
      </View>
      <Text style={styles.heroPrimary}>{primaryText}</Text>
      {sub ? <Text style={styles.heroSecondary}>{sub}.</Text> : null}
      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.btnPrimary} onPress={onClaim} activeOpacity={0.88}>
          <Text style={styles.btnPrimaryText}>Claim pickup</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnGhost} onPress={onOpen} activeOpacity={0.88}>
          <Text style={styles.btnGhostText}>
            {extraCount > 0 ? `See all ${extraCount + 1}` : 'Details'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Hero: quiet moment ─────────────────────────────────────────────
function HeroQuiet({ userLbs, chapterName, personalPickups, onOpenEvents }) {
  // Personal impact if the user has any, otherwise nudge to first
  // pickup. Family-days is the emotional payoff number.
  const families = familyDaysFromLbs(userLbs);
  const meals    = mealsFromLbs(userLbs);
  const hasImpact = userLbs > 0;
  return (
    <View style={styles.heroQuiet}>
      <Text style={styles.heroQuietEyebrow}>
        {hasImpact ? 'Your impact so far' : 'Welcome to the crew'}
      </Text>
      {hasImpact ? (
        <>
          <Text style={styles.heroQuietNum}>
            {userLbs.toLocaleString('en-US')}
            <Text style={styles.heroQuietNumUnit}> lbs rescued</Text>
          </Text>
          <Text style={styles.heroQuietBody}>
            That's roughly <Text style={styles.heroQuietBodyEm}>{families.toLocaleString('en-US')} famil{families === 1 ? 'y' : 'ies'} fed</Text> for a day
            {personalPickups > 0 ? ` across ${personalPickups} pickup${personalPickups === 1 ? '' : 's'}` : ''}
            .
          </Text>
        </>
      ) : (
        <>
          <Text style={styles.heroQuietNum}>Ready when you are.</Text>
          <Text style={styles.heroQuietBody}>
            {chapterName ? `Nothing new in ${chapterName} right this second — we'll notify you the moment a partner posts. `
                         : 'Nothing new right this second — we\'ll notify you the moment a partner posts. '}
            Meanwhile, RSVP for something upcoming.
          </Text>
        </>
      )}
      <TouchableOpacity style={styles.btnWarm} onPress={onOpenEvents} activeOpacity={0.88}>
        <Text style={styles.btnWarmText}>See what's next →</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Chapter today (state 1 support) ────────────────────────────────
function ChapterToday({ pulse, chapterName }) {
  if (!pulse || pulse.length === 0) return null;
  const totalLbs = pulse.reduce((s, p) => s + (p.actual_weight_lbs || p.estimated_weight_lbs || 0), 0);
  const cName = chapterName || 'Your chapter';
  return (
    <View style={styles.card}>
      <Text style={styles.cardEyebrow}>{cName} today</Text>
      <Text style={styles.cardTitle}>
        {totalLbs > 0
          ? `${Math.round(totalLbs)} lbs rescued this week across ${pulse.length} run${pulse.length === 1 ? '' : 's'}.`
          : `${pulse.length} recent pickup${pulse.length === 1 ? '' : 's'} this week.`}
      </Text>
      {pulse[0]?.restaurant_name && (
        <Text style={styles.cardMeta}>
          Last drop: {pulse[0].restaurant_name}
          {pulse[0].fridge_name ? ` → ${pulse[0].fridge_name}` : ''}
        </Text>
      )}
    </View>
  );
}

// ── Impact strip (state 2 support) ─────────────────────────────────
function ImpactStrip({ lbs }) {
  if (!lbs || lbs <= 0) return null;
  const meals = mealsFromLbs(lbs);
  const families = familyDaysFromLbs(lbs);
  return (
    <View style={styles.impactStrip}>
      <View style={styles.impactCell}>
        <Text style={styles.impactNum}>{lbs.toLocaleString('en-US')}</Text>
        <Text style={styles.impactLabel}>Lbs rescued</Text>
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

// ── Chapter pulse (state 2 support) ────────────────────────────────
function ChapterPulseCard({ pulse, chapterName }) {
  if (!pulse || pulse.length === 0) return null;
  const cName = chapterName || 'Your chapter';
  return (
    <View style={styles.card}>
      <View style={styles.pulseTitle}>
        <View style={styles.pulseDot} />
        <Text style={styles.cardEyebrow}>This week · {cName}</Text>
      </View>
      <View style={{ marginTop: 10 }}>
        {pulse.map((p) => (
          <View key={p.id} style={styles.pulseRow}>
            <Text style={styles.pulseRowText} numberOfLines={1}>
              <Text style={styles.pulseRowWho}>{p.restaurant_name || 'A restaurant'}</Text>
              {' → '}
              {p.fridge_name || 'a fridge'}
            </Text>
            <Text style={styles.pulseRowWhen}>{relativeShort(p.completed_at)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
function relativeShort(iso) {
  const t = iso?.toMillis?.() ? iso.toMillis()
          : iso?.toDate?.() ? iso.toDate().getTime()
          : iso ? new Date(iso).getTime() : 0;
  if (!t) return '';
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}

// ── Partner shortcut ────────────────────────────────────────────────
function PartnerShortcut({ onPost, onHistory }) {
  return (
    <View style={styles.partnerCard}>
      <Text style={styles.partnerEyebrow}>You're also a partner</Text>
      <Text style={styles.partnerTitle}>Post food surplus</Text>
      <Text style={styles.partnerBody}>
        Have leftover food today? Post it and a volunteer will pick it up. Free, tax-deductible, weighed and receipted.
      </Text>
      <View style={styles.partnerActions}>
        <TouchableOpacity style={styles.partnerBtnPrimary} onPress={onPost} activeOpacity={0.88}>
          <Text style={styles.partnerBtnPrimaryText}>Post surplus →</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.partnerBtnSecondary} onPress={onHistory} activeOpacity={0.88}>
          <Text style={styles.partnerBtnSecondaryText}>My donations</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── New-member checklist ────────────────────────────────────────────
function NewMemberChecklist({ verified, profileComplete, navigate }) {
  return (
    <View style={styles.checklist}>
      <Text style={styles.checklistEyebrow}>Get set up</Text>
      <Text style={styles.checklistTitle}>Two quick things before your first pickup</Text>
      <ChecklistItem n="1" title="Verify your ID" body="60 seconds — required before you can claim pickups."
        done={verified} onPress={() => navigate('VerifyId')} />
      <ChecklistItem n="2" title="Finish your profile" body="So restaurants can reach you on pickup day."
        done={profileComplete} onPress={() => navigate('EditProfile')} />
    </View>
  );
}
function ChecklistItem({ n, title, body, done, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.checklistItem, done && styles.checklistItemDone]}
      onPress={done ? undefined : onPress}
      activeOpacity={done ? 1 : 0.85}
    >
      <View style={[styles.checklistNum, done && styles.checklistNumDone]}>
        {done ? <Icon name="check" size={14} color={Colors.white} strokeWidth={3} /> : <Text style={styles.checklistNumText}>{n}</Text>}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.checklistItemTitle}>{title}</Text>
        <Text style={styles.checklistItemBody}>{body}</Text>
      </View>
      {!done && <Text style={styles.checklistItemCta}>Start →</Text>}
    </TouchableOpacity>
  );
}

// ── Styles ──────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // Identity strip
  idStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 6,
  },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.green,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: {
    color: Colors.cream,
    fontFamily: SERIF,
    fontSize: 16, fontWeight: '500',
  },
  greeting: { flex: 1, minWidth: 0 },
  greetingK: { fontSize: 12, color: Colors.gray },
  greetingT: { fontSize: 16, fontWeight: '600', color: Colors.dark, marginTop: 1 },
  bell: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.white,
    borderWidth: 1, borderColor: Colors.glassBorder,
    alignItems: 'center', justifyContent: 'center',
    position: 'relative',
  },
  bellDot: {
    position: 'absolute',
    top: 8, right: 8,
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: Colors.pink,
    borderWidth: 2, borderColor: Colors.white,
  },

  // Hero card (states 1 & 2)
  hero: {
    backgroundColor: Colors.white,
    borderRadius: 22,
    padding: 20,
    borderWidth: 1, borderColor: Colors.glassBorder,
    gap: 12,
    marginTop: 6,
  },
  heroEyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    flexWrap: 'wrap',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5, paddingHorizontal: 10,
    borderRadius: 999,
  },
  chipProgress: { backgroundColor: Colors.greenLight },
  chipDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.green },
  chipTextProgress: {
    fontSize: 10.5, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase',
    color: Colors.green,
  },
  chipNew: { backgroundColor: '#FDF0F3' },
  chipTextNew: {
    fontSize: 10.5, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase',
    color: Colors.pink,
  },
  heroPrimary: {
    fontFamily: SERIF,
    fontSize: 22, lineHeight: 28,
    color: Colors.dark, fontWeight: '500',
    letterSpacing: -0.2,
  },
  heroSecondary: {
    fontSize: 14, color: Colors.gray, lineHeight: 20,
    marginTop: -6,
  },

  // Route rail
  routeGrid: {
    flexDirection: 'row',
    gap: 14,
    paddingVertical: 4,
  },
  routeRail: {
    width: 12,
    alignItems: 'center',
    paddingTop: 6,
  },
  routeDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.green },
  routeDotOutline: {
    backgroundColor: Colors.white,
    borderWidth: 2, borderColor: Colors.green,
  },
  routeLine: {
    width: 2, flex: 1, minHeight: 24,
    backgroundColor: Colors.green + '33',
    marginVertical: 3,
  },
  routeCols: { flex: 1, gap: 14 },
  routeStop: {},
  routeLabel: {
    fontSize: 10, fontWeight: '800', letterSpacing: 1.2,
    color: Colors.gray,
  },
  routePlace: {
    fontSize: 14.5, fontWeight: '500', color: Colors.dark,
    marginTop: 2,
  },

  // Actions
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  btnPrimary: {
    flex: 2, minWidth: 160,
    backgroundColor: Colors.green,
    paddingVertical: 13, paddingHorizontal: 18,
    borderRadius: 14,
    alignItems: 'center',
  },
  btnPrimaryText: { color: Colors.cream, fontSize: 14.5, fontWeight: '700', letterSpacing: -0.1 },
  btnGhost: {
    flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 6,
    flex: 1, minWidth: 96,
    paddingVertical: 12, paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1, borderColor: Colors.green + '33',
  },
  btnGhostText: { color: Colors.green, fontSize: 13.5, fontWeight: '700' },
  btnWarm: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.pink,
    paddingVertical: 11, paddingHorizontal: 18,
    borderRadius: 14,
    marginTop: 4,
  },
  btnWarmText: { color: '#FFF', fontSize: 14, fontWeight: '700' },

  // Hero quiet (state 3) — forest ground with warm serif number
  heroQuiet: {
    backgroundColor: Colors.green,
    borderRadius: 22,
    padding: 22,
    gap: 10,
    marginTop: 6,
  },
  heroQuietEyebrow: {
    fontSize: 10.5, fontWeight: '800', letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.62)',
  },
  heroQuietNum: {
    fontFamily: SERIF,
    fontSize: 44, lineHeight: 46,
    fontWeight: '500', letterSpacing: -0.8,
    color: Colors.cream,
    marginTop: 4,
  },
  heroQuietNumUnit: {
    fontFamily: undefined,
    fontSize: 15, fontWeight: '500',
    color: 'rgba(255,255,255,0.68)',
    letterSpacing: 0,
  },
  heroQuietBody: {
    fontSize: 14.5, lineHeight: 21,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 6,
  },
  heroQuietBodyEm: {
    color: Colors.cream,
    fontWeight: '700',
  },

  // Generic card
  card: {
    backgroundColor: Colors.white,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1, borderColor: Colors.glassBorder,
  },
  cardEyebrow: {
    fontSize: 10.5, fontWeight: '800', letterSpacing: 1.4,
    textTransform: 'uppercase', color: Colors.gray,
    marginBottom: 6,
  },
  cardTitle: { fontSize: 15, fontWeight: '600', color: Colors.dark, lineHeight: 20 },
  cardMeta: { fontSize: 12.5, color: Colors.gray, marginTop: 4 },

  // Impact strip
  impactStrip: {
    backgroundColor: Colors.white,
    borderRadius: 18,
    borderWidth: 1, borderColor: Colors.glassBorder,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  impactCell: { flex: 1, alignItems: 'center' },
  impactNum: {
    fontFamily: SERIF,
    fontSize: 26, lineHeight: 28,
    color: Colors.dark,
    fontWeight: '500', letterSpacing: -0.4,
  },
  impactLabel: {
    fontSize: 11, fontWeight: '600', color: Colors.gray,
    marginTop: 6, letterSpacing: 0.3,
    textAlign: 'center',
  },
  impactDivider: {
    width: 1, height: 30,
    backgroundColor: Colors.glassBorder,
  },

  // Chapter pulse
  pulseTitle: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  pulseDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: Colors.green,
    opacity: 0.85,
  },
  pulseRow: {
    flexDirection: 'row', alignItems: 'baseline', gap: 8,
    paddingVertical: 6,
    borderTopWidth: 0.5, borderTopColor: Colors.glassBorder,
  },
  pulseRowText: { flex: 1, fontSize: 13, color: Colors.dark, lineHeight: 18 },
  pulseRowWho: { fontWeight: '700' },
  pulseRowWhen: { fontSize: 12, color: Colors.gray, fontVariant: ['tabular-nums'] },

  // Partner shortcut
  partnerCard: {
    backgroundColor: '#FFF9EC',
    borderRadius: 18,
    padding: 16,
    borderLeftWidth: 4, borderLeftColor: '#E0A52F',
  },
  partnerEyebrow: {
    fontSize: 10.5, fontWeight: '800', letterSpacing: 1.4,
    color: '#7A5400', textTransform: 'uppercase',
  },
  partnerTitle: { fontSize: 17, fontWeight: '700', color: Colors.dark, marginTop: 4, letterSpacing: -0.2 },
  partnerBody: { fontSize: 13, color: Colors.gray, marginTop: 6, lineHeight: 19 },
  partnerActions: { flexDirection: 'row', gap: 10, marginTop: 12, flexWrap: 'wrap' },
  partnerBtnPrimary: {
    paddingVertical: 10, paddingHorizontal: 16,
    backgroundColor: Colors.green, borderRadius: 10,
  },
  partnerBtnPrimaryText: { color: '#FFF', fontWeight: '800', fontSize: 14 },
  partnerBtnSecondary: {
    paddingVertical: 10, paddingHorizontal: 16,
    backgroundColor: 'transparent', borderRadius: 10,
    borderWidth: 1, borderColor: Colors.green,
  },
  partnerBtnSecondaryText: { color: Colors.green, fontWeight: '800', fontSize: 14 },

  // Checklist
  checklist: {
    backgroundColor: Colors.white,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1, borderColor: Colors.glassBorder,
    gap: 6,
  },
  checklistEyebrow: {
    fontSize: 10.5, fontWeight: '800', letterSpacing: 1.4,
    color: Colors.green, textTransform: 'uppercase',
  },
  checklistTitle: {
    fontSize: 16, fontWeight: '600', color: Colors.dark,
    marginBottom: 6, letterSpacing: -0.1,
  },
  checklistItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10,
  },
  checklistItemDone: { opacity: 0.55 },
  checklistNum: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: Colors.greenLight,
    alignItems: 'center', justifyContent: 'center',
  },
  checklistNumDone: { backgroundColor: Colors.green },
  checklistNumText: { fontWeight: '800', color: Colors.green, fontSize: 12 },
  checklistItemTitle: { fontSize: 14, fontWeight: '700', color: Colors.dark },
  checklistItemBody: { fontSize: 12.5, color: Colors.gray, marginTop: 1 },
  checklistItemCta: { fontSize: 13, fontWeight: '700', color: Colors.pink },
});
