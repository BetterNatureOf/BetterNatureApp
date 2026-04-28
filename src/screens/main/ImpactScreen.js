import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import StatCard from '../../components/ui/StatCard';
import BrushDivider from '../../components/ui/BrushDivider';
import useAuthStore from '../../store/authStore';
import { LeaderboardBody } from './LeaderboardScreen';
import { getOrgStats } from '../../services/orgStats';

const fmt = (n) => (!n ? '0' : n.toLocaleString('en-US'));

export default function ImpactScreen() {
  const user = useAuthStore((s) => s.user);
  const [org, setOrg] = useState({ meals: 0, lbs: 0, water: 0, co2: 0, events: 0 });

  useEffect(() => {
    getOrgStats().then(setOrg).catch(() => {});
  }, []);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <BrushText variant="screenTitle" style={styles.title}>
        Your Impact
      </BrushText>
      <Text style={styles.subtitle}>
        Every action matters. Here's what you've contributed.
      </Text>

      {/* Personal Stats */}
      <View style={styles.statsGrid}>
        <StatCard
          number={user?.events_attended || 0}
          label="Events Attended"
          color={Colors.green}
          style={styles.gridItem}
        />
        <StatCard
          number={user?.meals_rescued || 0}
          label="Meals Rescued"
          color={Colors.sage}
          style={styles.gridItem}
        />
        <StatCard
          number={`${user?.hours_logged || 0}h`}
          label="Hours Volunteered"
          color={Colors.pink}
          style={styles.gridItem}
        />
        <StatCard
          number="0"
          label="Badges Earned"
          color={Colors.sky}
          style={styles.gridItem}
        />
      </View>

      <BrushDivider />

      {/* Organization-wide Stats */}
      <BrushText variant="sectionHeader" style={styles.sectionTitle}>
        Better Nature Overall
      </BrushText>

      <LinearGradient
        colors={Colors.gradient.green}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.orgHero}
      >
        <View style={styles.orgHeroRow}>
          <View style={styles.orgStat}>
            <BrushText variant="heroStat" style={styles.orgNumber}>
              {fmt(org.meals)}
            </BrushText>
            <Text style={styles.orgLabel}>Meals Rescued</Text>
          </View>
          <View style={styles.orgDivider} />
          <View style={styles.orgStat}>
            <BrushText variant="heroStat" style={styles.orgNumber}>
              {fmt(org.lbs)}
            </BrushText>
            <Text style={styles.orgLabel}>Pounds Rescued</Text>
          </View>
        </View>
      </LinearGradient>

      <View style={styles.orgCard}>
        <View style={styles.orgStat}>
          <BrushText variant="heroStat" style={{ color: Colors.sky }}>
            {fmt(org.water)}
          </BrushText>
          <Text style={styles.orgLabelDark}>Gallons of Water Saved</Text>
        </View>
        <View style={styles.orgDividerDark} />
        <View style={styles.orgStat}>
          <BrushText variant="heroStat" style={{ color: Colors.pink }}>
            {fmt(org.co2)}
          </BrushText>
          <Text style={styles.orgLabelDark}>Pounds CO₂ Avoided</Text>
        </View>
      </View>

      <BrushDivider />

      {/* Badges Section */}
      <BrushText variant="sectionHeader" style={styles.sectionTitle}>
        Your Badges
      </BrushText>
      <View style={styles.badgesEmpty}>
        <View style={styles.badgeIconWrap}>
          <Text style={styles.badgeEmoji}>{'\u{1F331}'}</Text>
        </View>
        <Text style={styles.badgesText}>
          Attend your first event to earn your first badge!
        </Text>
      </View>

      <BrushDivider />

      {/* Leaderboard */}
      <BrushText variant="sectionHeader" style={styles.sectionTitle}>
        Leaderboard
      </BrushText>
      <Text style={styles.leaderIntro}>
        See who's making the biggest impact. Filter by time, project, or sort
        by meals, hours, events, or dollars raised.
      </Text>
      <LeaderboardBody embedded />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  content: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  title: { color: Colors.green },
  subtitle: { ...Type.body, color: Colors.gray, marginTop: 4, marginBottom: 24 },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  gridItem: { width: '47%' },
  sectionTitle: { color: Colors.green, marginBottom: 14 },
  orgHero: {
    borderRadius: Radius.xl,
    padding: 24,
    marginBottom: 12,
  },
  orgHeroRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  orgStat: { flex: 1, alignItems: 'center' },
  orgNumber: { color: Colors.white },
  orgLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 13, marginTop: 2, textAlign: 'center', fontWeight: '500' },
  orgDivider: { width: 1, height: 50, backgroundColor: 'rgba(255,255,255,0.2)' },
  orgCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: 24,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    ...Shadows.card,
  },
  orgDividerDark: { width: 1, height: 50, backgroundColor: Colors.grayLight },
  orgLabelDark: { ...Type.caption, marginTop: 4, textAlign: 'center' },
  badgesEmpty: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    ...Shadows.soft,
  },
  badgeIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.greenLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  badgeEmoji: { fontSize: 32 },
  badgesText: { ...Type.body, color: Colors.gray, textAlign: 'center' },
  leaderIntro: {
    ...Type.caption,
    color: Colors.gray,
    marginTop: -6,
    marginBottom: 12,
  },
});
