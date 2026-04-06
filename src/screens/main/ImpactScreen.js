import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import StatCard from '../../components/ui/StatCard';
import BrushDivider from '../../components/ui/BrushDivider';
import useAuthStore from '../../store/authStore';

export default function ImpactScreen() {
  const user = useAuthStore((s) => s.user);

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

      <View style={styles.orgCard}>
        <View style={styles.orgStat}>
          <BrushText variant="heroStat" style={{ color: Colors.green }}>
            2,400+
          </BrushText>
          <Text style={styles.orgLabel}>Meals Rescued</Text>
        </View>
        <View style={styles.orgDivider} />
        <View style={styles.orgStat}>
          <BrushText variant="heroStat" style={{ color: Colors.sage }}>
            150+
          </BrushText>
          <Text style={styles.orgLabel}>Animals Helped</Text>
        </View>
      </View>

      <View style={styles.orgCard}>
        <View style={styles.orgStat}>
          <BrushText variant="heroStat" style={{ color: Colors.sky }}>
            $12K
          </BrushText>
          <Text style={styles.orgLabel}>Raised for Clean Water</Text>
        </View>
        <View style={styles.orgDivider} />
        <View style={styles.orgStat}>
          <BrushText variant="heroStat" style={{ color: Colors.pink }}>
            500+
          </BrushText>
          <Text style={styles.orgLabel}>Active Volunteers</Text>
        </View>
      </View>

      <BrushDivider />

      {/* Badges Section */}
      <BrushText variant="sectionHeader" style={styles.sectionTitle}>
        Your Badges
      </BrushText>
      <View style={styles.badgesEmpty}>
        <Text style={styles.badgeEmoji}>🌱</Text>
        <Text style={styles.badgesText}>
          Attend your first event to earn your first badge!
        </Text>
      </View>
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
  sectionTitle: { color: Colors.green, marginBottom: 12 },
  orgCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: 24,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    ...Shadows.card,
  },
  orgStat: { flex: 1, alignItems: 'center' },
  orgDivider: { width: 1, height: 50, backgroundColor: Colors.grayLight },
  orgLabel: { ...Type.caption, marginTop: 4, textAlign: 'center' },
  badgesEmpty: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: 32,
    alignItems: 'center',
    ...Shadows.card,
  },
  badgeEmoji: { fontSize: 48, marginBottom: 12 },
  badgesText: { ...Type.body, color: Colors.gray, textAlign: 'center' },
});
