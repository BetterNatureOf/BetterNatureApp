// Belong tab landing — Phase 1 slice 3.
//
// The blueprint's identity model is: one account, many memberships.
// This screen is the user's window on that — every unit they belong
// to (chapters, projects, partner orgs) plus the paths to grow that
// list (find a chapter, start one, join a partner org).
//
// Reads through the new Membership + OrgUnit tables from slice 2 with
// a fallback to legacy user.chapter_id so returning users see their
// existing chapter even before the dual-write has populated a
// Membership row for them. Once slice 3's cutover completes, the
// fallback goes away.
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import ResponsiveContainer from '../../components/ui/ResponsiveContainer';
import Screen from '../../components/ui/Screen';
import Icon from '../../components/ui/Icon';
import useAuthStore from '../../store/authStore';
import { getMembershipsForUser, MEMBERSHIP_STATUS } from '../../services/memberships';
import { getOrgUnit } from '../../services/orgUnits';
import { fetchChapterById } from '../../services/database';
import { hasRole } from '../../services/roles';

const SERIF = Platform.select({
  ios: 'Georgia',
  android: 'serif',
  default: 'Georgia, "Iowan Old Style", "Palatino Linotype", serif',
});

function statusLabel(status) {
  switch (status) {
    case MEMBERSHIP_STATUS.ACTIVE:      return 'Active';
    case MEMBERSHIP_STATUS.PENDING:     return 'Pending';
    case MEMBERSHIP_STATUS.APPLICANT:   return 'Applicant';
    case MEMBERSHIP_STATUS.LEAVE:       return 'On leave';
    case MEMBERSHIP_STATUS.ALUMNI:      return 'Alumni';
    case MEMBERSHIP_STATUS.SUSPENDED:   return 'Suspended';
    case MEMBERSHIP_STATUS.TRANSFERRED: return 'Transferred';
    default: return 'Member';
  }
}
function statusTone(status) {
  if (status === MEMBERSHIP_STATUS.ACTIVE) return { bg: Colors.greenLight, fg: Colors.green };
  if (status === MEMBERSHIP_STATUS.PENDING || status === MEMBERSHIP_STATUS.APPLICANT)
    return { bg: '#FFF6E6', fg: '#7A5400' };
  if (status === MEMBERSHIP_STATUS.ALUMNI) return { bg: '#E8E1F4', fg: '#5B3A8E' };
  if (status === MEMBERSHIP_STATUS.SUSPENDED) return { bg: '#FCE3E3', fg: '#8E1B1B' };
  return { bg: Colors.grayFaint, fg: Colors.gray };
}

// Enrich each membership row with its OrgUnit name so the card reads
// as a place, not a UUID. Falls back to legacy chapter fetch when the
// OrgUnit table hasn't been populated for this chapter yet.
async function enrichMemberships(rows) {
  return Promise.all(rows.map(async (m) => {
    let name = '';
    try {
      const ou = await getOrgUnit(m.org_unit_id);
      name = ou?.name || '';
    } catch {}
    if (!name) {
      try {
        const ch = await fetchChapterById(m.org_unit_id);
        name = ch?.name || '';
      } catch {}
    }
    return { ...m, name: name || 'Unnamed unit' };
  }));
}

export default function BelongScreen({ navigation }) {
  const user = useAuthStore((s) => s.user);
  const [memberships, setMemberships] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fallback, setFallback] = useState(null); // legacy user.chapter_id fallback card

  const load = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    setLoading(true);
    try {
      const raw = await getMembershipsForUser(user.id);
      const enriched = await enrichMemberships(raw);
      setMemberships(enriched);
      // Legacy-fallback: if the new tables haven't caught up but the
      // user still has a chapter_id, surface that as a soft card so
      // they don't see an empty page mid-migration.
      if (raw.length === 0 && user.chapter_id) {
        const ch = await fetchChapterById(user.chapter_id).catch(() => null);
        setFallback({
          id: user.chapter_id,
          name: ch?.name || user.chapter?.name || user.chapter_name || 'Your chapter',
          status: 'active',
        });
      } else {
        setFallback(null);
      }
    } catch {}
    setLoading(false);
  }, [user?.id, user?.chapter_id]);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const canStartChapter = true; // Blueprint §12: any account can apply.
  const rows = memberships.length > 0 ? memberships : (fallback ? [fallback] : []);

  return (
    <Screen contentStyle={[styles.content]}>
      <ResponsiveContainer maxWidth={720}>
        <Text style={styles.eyebrow}>Belong</Text>
        <Text style={styles.title}>Where you fit in the network.</Text>
        <Text style={styles.lead}>
          Every chapter, project, and partner org you're part of — plus places you might join next.
        </Text>

        {/* Your memberships */}
        <SectionHeader label="Your memberships" count={rows.length} />

        {loading ? (
          <View style={styles.card}>
            <Text style={styles.cardMeta}>Loading…</Text>
          </View>
        ) : rows.length === 0 ? (
          <EmptyMemberships onFind={() => navigation.navigate('FindChapter')} />
        ) : (
          rows.map((m) => (
            <MembershipCard
              key={m.id}
              membership={m}
              isLegacyFallback={fallback && m.id === fallback.id && memberships.length === 0}
              onOpen={() => navigation.navigate('ChapterChecklist')}
            />
          ))
        )}

        {/* Discover */}
        <SectionHeader label="Discover" />
        <NavCard
          icon="pin"
          title="Find a chapter"
          body="Browse every active BetterNature chapter. Request to join or switch."
          onPress={() => navigation.navigate('FindChapter')}
        />
        {canStartChapter && (
          <NavCard
            icon="plus"
            title="Start a chapter"
            body="No chapter near you? Apply to found one. Reviewed within 48 hours."
            onPress={() => navigation.navigate('StartChapter')}
          />
        )}
        <NavCard
          icon="clipboard"
          title="Apply as a partner"
          body="Restaurant, church garden, school kitchen, or community org — post surplus food and get tax receipts."
          onPress={() => navigation.navigate('RestaurantSignup')}
        />

        {/* Your public presence */}
        <SectionHeader label="Public presence" />
        <NavCard
          icon="gift"
          title="Bring a friend"
          body="Your referral code invites new volunteers into your chapter."
          onPress={() => navigation.navigate('Refer')}
        />
        {hasRole(user, ['executive', 'admin', 'chapter_president', 'chapter_pres']) && (
          <NavCard
            icon="building"
            title="Chapter checklist"
            body="Public-facing chapter setup progress and roster."
            onPress={() => navigation.navigate('ChapterChecklist')}
          />
        )}
      </ResponsiveContainer>
    </Screen>
  );
}

function SectionHeader({ label, count }) {
  return (
    <View style={styles.sectionHead}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {typeof count === 'number' && count > 0 ? (
        <View style={styles.countPill}>
          <Text style={styles.countPillText}>{count}</Text>
        </View>
      ) : null}
    </View>
  );
}

function MembershipCard({ membership, isLegacyFallback, onOpen }) {
  const tone = statusTone(membership.status);
  return (
    <TouchableOpacity style={styles.membershipCard} onPress={onOpen} activeOpacity={0.88}>
      <View style={styles.membershipHead}>
        <View style={styles.membershipIcon}>
          <Icon name="pin" size={16} color={Colors.green} strokeWidth={2} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.membershipName} numberOfLines={1}>{membership.name}</Text>
          <Text style={styles.membershipClass}>
            {membership.membership_class ? membership.membership_class : 'chapter'}
            {isLegacyFallback ? ' · legacy record — will migrate on your next chapter update' : ''}
          </Text>
        </View>
        <View style={[styles.statusPill, { backgroundColor: tone.bg }]}>
          <Text style={[styles.statusPillText, { color: tone.fg }]}>
            {statusLabel(membership.status)}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function EmptyMemberships({ onFind }) {
  return (
    <View style={styles.emptyCard}>
      <View style={styles.emptyIcon}>
        <Icon name="pin" size={20} color={Colors.green} strokeWidth={2} />
      </View>
      <Text style={styles.emptyTitle}>No chapter yet</Text>
      <Text style={styles.emptyBody}>
        Join a chapter to see pickups near you, RSVP for events, and get on the roster.
      </Text>
      <TouchableOpacity style={styles.emptyBtn} onPress={onFind} activeOpacity={0.88}>
        <Text style={styles.emptyBtnText}>Find a chapter →</Text>
      </TouchableOpacity>
    </View>
  );
}

function NavCard({ icon, title, body, onPress }) {
  return (
    <TouchableOpacity style={styles.navCard} onPress={onPress} activeOpacity={0.88}>
      <View style={styles.navCardIcon}>
        <Icon name={icon} size={16} color={Colors.green} strokeWidth={2} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.navCardTitle}>{title}</Text>
        <Text style={styles.navCardBody}>{body}</Text>
      </View>
      <Icon name="chevron" size={16} color={Colors.grayMid} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingTop: 60, paddingBottom: 60, gap: 10 },

  eyebrow: {
    fontSize: 11, fontWeight: '800', letterSpacing: 1.6, textTransform: 'uppercase',
    color: Colors.green,
  },
  title: {
    fontFamily: SERIF, fontSize: 26, lineHeight: 32,
    fontWeight: '500', letterSpacing: -0.2,
    color: Colors.dark, marginTop: 4,
  },
  lead: { fontSize: 14.5, color: Colors.gray, marginTop: 6, marginBottom: 12, lineHeight: 21 },

  sectionHead: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20, marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 12, fontWeight: '800', letterSpacing: 1.3, textTransform: 'uppercase',
    color: Colors.green,
  },
  countPill: {
    minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 7,
    backgroundColor: Colors.greenLight,
    alignItems: 'center', justifyContent: 'center',
  },
  countPillText: { fontSize: 11, fontWeight: '800', color: Colors.green },

  card: {
    backgroundColor: Colors.white, borderRadius: 18, padding: 16,
    borderWidth: 1, borderColor: Colors.glassBorder, marginBottom: 8,
  },
  cardMeta: { fontSize: 13, color: Colors.gray },

  membershipCard: {
    backgroundColor: Colors.white, borderRadius: 18, padding: 16,
    borderWidth: 1, borderColor: Colors.glassBorder, marginBottom: 8,
  },
  membershipHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  membershipIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: Colors.greenLight,
    alignItems: 'center', justifyContent: 'center',
  },
  membershipName: { fontSize: 15.5, fontWeight: '700', color: Colors.dark, letterSpacing: -0.1 },
  membershipClass: { fontSize: 12, color: Colors.gray, marginTop: 2, textTransform: 'capitalize' },
  statusPill: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999 },
  statusPillText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },

  emptyCard: {
    backgroundColor: Colors.white, borderRadius: 18, padding: 20,
    borderWidth: 1, borderColor: Colors.glassBorder, gap: 10, marginBottom: 8,
  },
  emptyIcon: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: Colors.greenLight,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: Colors.dark, marginTop: 4 },
  emptyBody: { ...Type.caption, lineHeight: 19 },
  emptyBtn: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.green,
    paddingVertical: 10, paddingHorizontal: 16,
    borderRadius: 12, marginTop: 4,
  },
  emptyBtnText: { color: Colors.cream, fontWeight: '700', fontSize: 13.5 },

  navCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.white, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: Colors.glassBorder, marginBottom: 6,
  },
  navCardIcon: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: Colors.greenLight,
    alignItems: 'center', justifyContent: 'center',
  },
  navCardTitle: { fontSize: 14, fontWeight: '700', color: Colors.dark },
  navCardBody: { fontSize: 12.5, color: Colors.gray, marginTop: 2, lineHeight: 18 },
});
