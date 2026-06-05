import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Type, Radius } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import { siteVal } from '../../services/siteContent';
import Button from '../../components/ui/Button';
import Logo from '../../components/ui/Logo';
import ResponsiveContainer from '../../components/ui/ResponsiveContainer';
import { getOrgStats } from '../../services/orgStats';
import { fetchAllMembers, fetchChapters } from '../../services/database';
import Screen from '../../components/ui/Screen';

const fmt = (n) => (!n ? '0' : n.toLocaleString('en-US'));

export default function WelcomeScreen({ navigation }) {
  const [stats, setStats] = useState({ meals: 0 });
  const [volunteers, setVolunteers] = useState(0);
  const [chapters, setChapters] = useState(0);
  useEffect(() => {
    let alive = true;
    function refresh() {
      if (!alive) return;
      getOrgStats().then((s) => alive && setStats(s)).catch(() => {});
      fetchAllMembers().then((m) => alive && setVolunteers(m.length)).catch(() => {});
      fetchChapters().then((c) => alive && setChapters(c.length)).catch(() => {});
    }
    refresh();
    // Re-pull every 15s so the hero numbers track real activity
    // without requiring the visitor to reload the page.
    const t = setInterval(refresh, 15000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  return (
    <Screen contentStyle={styles.content} showsVerticalScrollIndicator={false}>
      <ResponsiveContainer maxWidth={520}>
        {/* Hero */}
        <LinearGradient
          colors={Colors.gradient.green}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.decorCircle1} />
          <View style={styles.decorCircle2} />
          <View style={styles.logoRing}>
            <Logo size={120} style={styles.logo} />
          </View>
          <BrushText variant="heroStat" style={styles.title}>
            BetterNature
          </BrushText>
          <Text style={styles.tagline}>{siteVal('hero.eyebrow', 'Food rescue \u00B7 Conservation \u00B7 Clean water')}</Text>

          {/* Mini stats */}
          <View style={styles.statsRow}>
            <View style={styles.miniStat}>
              <Text style={styles.miniStatNum}>{fmt(stats.lbs || Math.round((stats.meals || 0) / 1.2))}</Text>
              <Text style={styles.miniStatLabel}>Pounds rescued</Text>
            </View>
            <View style={styles.miniDivider} />
            <View style={styles.miniStat}>
              <Text style={styles.miniStatNum}>{fmt(volunteers)}</Text>
              <Text style={styles.miniStatLabel}>Volunteers</Text>
            </View>
            <View style={styles.miniDivider} />
            <View style={styles.miniStat}>
              <Text style={styles.miniStatNum}>{fmt(chapters)}</Text>
              <Text style={styles.miniStatLabel}>Chapters</Text>
            </View>
          </View>
        </LinearGradient>

        <View style={styles.bottom}>
          <Button
            title="Get Started"
            onPress={() => navigation.navigate('SignupStep1')}
          />
          <Button
            title="I already have an account"
            variant="secondary"
            onPress={() => navigation.navigate('Login')}
            style={styles.loginBtn}
          />

          <Text style={styles.footnote}>
            Restaurant partners, chapter presidents, and executives sign in with the
            credentials sent to them after approval.
          </Text>
        </View>
      </ResponsiveContainer>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
    ...(Platform.OS === 'web' ? { height: '100vh' } : null),
  },
  content: { flexGrow: 1, paddingBottom: 60 },
  hero: {
    paddingTop: 80,
    paddingBottom: 40,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderBottomLeftRadius: 36,
    borderBottomRightRadius: 36,
    overflow: 'hidden',
    marginBottom: 32,
  },
  decorCircle1: {
    position: 'absolute',
    top: -40,
    right: -40,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  decorCircle2: {
    position: 'absolute',
    bottom: -20,
    left: -30,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  logoRing: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  logo: { backgroundColor: Colors.cream },
  title: { color: Colors.white },
  tagline: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    marginTop: 6,
    fontWeight: '500',
    letterSpacing: 0.5,
  },
  statsRow: {
    flexDirection: 'row',
    marginTop: 28,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  miniStat: { flex: 1, alignItems: 'center' },
  miniStatNum: { color: Colors.white, fontSize: 18, fontWeight: '800', fontFamily: 'Caveat-Bold' },
  miniStatLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '500', marginTop: 2 },
  miniDivider: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.15)' },
  bottom: { paddingHorizontal: 24 },
  loginBtn: { marginTop: 12 },
  footnote: {
    ...Type.caption,
    textAlign: 'center',
    marginTop: 28,
    fontStyle: 'italic',
    color: Colors.gray,
  },
});
