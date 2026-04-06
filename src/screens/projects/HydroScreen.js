import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import StatCard from '../../components/ui/StatCard';
import BrushDivider from '../../components/ui/BrushDivider';
import Input from '../../components/ui/Input';
import { openDonationForm } from '../../services/zeffy';

const MILESTONES = [
  { label: 'Research Phase', status: 'complete' },
  { label: 'Partner Identified', status: 'complete' },
  { label: 'Fundraising', status: 'progress' },
  { label: 'Implementation', status: 'pending' },
  { label: 'First Well Built', status: 'pending' },
];

export default function HydroScreen({ navigation }) {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
        <BrushText variant="screenTitle" style={styles.title}>
          Hydro
        </BrushText>
        <Text style={styles.subtitle}>Clean Water Access</Text>
        <Text style={styles.desc}>
          1 in 10 people lack access to clean water. Help us change that by
          funding wells and filtration systems in underserved communities.
        </Text>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <StatCard number="$12K" label="Raised" color={Colors.skyDark} style={styles.stat} />
        <StatCard number="$25K" label="Goal" color={Colors.skyDark} style={styles.stat} />
        <StatCard number="48%" label="Progress" color={Colors.skyDark} style={styles.stat} />
      </View>

      {/* Progress Bar */}
      <View style={styles.progressWrap}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: '48%' }]} />
        </View>
        <Text style={styles.progressLabel}>$12,000 / $25,000</Text>
      </View>

      <BrushDivider color={Colors.sky} />

      {/* Timeline */}
      <BrushText variant="sectionHeader" style={styles.sectionTitle}>
        Project Timeline
      </BrushText>

      {MILESTONES.map((milestone, i) => (
        <View key={i} style={styles.timelineRow}>
          <View style={styles.timelineLeft}>
            <View
              style={[
                styles.timelineDot,
                milestone.status === 'complete' && styles.dotComplete,
                milestone.status === 'progress' && styles.dotProgress,
              ]}
            />
            {i < MILESTONES.length - 1 && <View style={styles.timelineLine} />}
          </View>
          <View style={styles.timelineContent}>
            <Text
              style={[
                styles.timelineLabel,
                milestone.status === 'complete' && styles.labelComplete,
              ]}
            >
              {milestone.label}
            </Text>
            <Text style={styles.timelineStatus}>
              {milestone.status === 'complete'
                ? '✓ Complete'
                : milestone.status === 'progress'
                ? 'In Progress'
                : 'Upcoming'}
            </Text>
          </View>
        </View>
      ))}

      <BrushDivider color={Colors.sky} />

      {/* Emotional Donate CTA */}
      <Card style={styles.donateCard}>
        <BrushText variant="sectionHeader" style={styles.donateTitle}>
          Every Drop Counts
        </BrushText>
        <Text style={styles.donateBody}>
          $25 can provide clean water for one person for an entire year. Your
          generosity creates ripples that change lives.
        </Text>
        <Button
          title="Donate to Hydro"
          onPress={() => openDonationForm({ amount: 25 })}
          style={styles.donateBtn}
        />
      </Card>

      <BrushDivider color={Colors.sky} />

      {/* Collaboration Form */}
      <BrushText variant="sectionHeader" style={styles.sectionTitle}>
        Want to Collaborate?
      </BrushText>
      <Card style={styles.collabCard}>
        <Text style={styles.collabDesc}>
          We're looking for NGOs, engineers, and organizations to partner with
          on clean water projects.
        </Text>
        <Input label="Your Name" placeholder="Name" />
        <Input label="Organization" placeholder="Org name (optional)" />
        <Input label="Email" placeholder="you@email.com" keyboardType="email-address" autoCapitalize="none" />
        <Input label="Message" placeholder="How would you like to help?" multiline style={{ height: 80 }} />
        <Button title="Send Message" onPress={() => {}} />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  content: { paddingBottom: 40 },
  header: { padding: 24, paddingTop: 60, backgroundColor: Colors.skyLight },
  back: { fontSize: 16, color: Colors.skyDark, marginBottom: 8 },
  title: { color: Colors.skyDark, fontSize: 36 },
  subtitle: { fontSize: 14, color: Colors.gray, marginTop: 2 },
  desc: { ...Type.body, color: Colors.gray, marginTop: 8, lineHeight: 22 },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    marginTop: 20,
    gap: 10,
  },
  stat: { flex: 1 },
  progressWrap: { paddingHorizontal: 24, marginTop: 16 },
  progressTrack: {
    height: 10,
    backgroundColor: Colors.grayLight,
    borderRadius: 5,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.sky,
    borderRadius: 5,
  },
  progressLabel: { ...Type.caption, marginTop: 6, textAlign: 'center' },
  sectionTitle: { color: Colors.skyDark, paddingHorizontal: 24, marginBottom: 12 },
  timelineRow: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    marginBottom: 4,
  },
  timelineLeft: { width: 30, alignItems: 'center' },
  timelineDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.grayLight,
    borderWidth: 2,
    borderColor: Colors.grayMid,
  },
  dotComplete: { backgroundColor: Colors.sky, borderColor: Colors.skyDark },
  dotProgress: { backgroundColor: Colors.white, borderColor: Colors.sky },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: Colors.grayLight,
    marginVertical: 2,
  },
  timelineContent: { flex: 1, paddingBottom: 16, paddingLeft: 8 },
  timelineLabel: { fontSize: 15, fontWeight: '600', color: Colors.dark },
  labelComplete: { color: Colors.skyDark },
  timelineStatus: { ...Type.caption, marginTop: 2 },
  donateCard: {
    marginHorizontal: 24,
    backgroundColor: Colors.skyLight,
    borderWidth: 1,
    borderColor: Colors.sky,
  },
  donateTitle: { color: Colors.skyDark },
  donateBody: { ...Type.body, color: Colors.gray, marginTop: 6, marginBottom: 16, lineHeight: 22 },
  donateBtn: {},
  collabCard: { marginHorizontal: 24 },
  collabDesc: { ...Type.body, color: Colors.gray, marginBottom: 16, lineHeight: 22 },
});
