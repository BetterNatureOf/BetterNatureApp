import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Type, Spacing } from '../../config/theme';
import BrushText from '../ui/BrushText';
import Logo from '../ui/Logo';

export default function DashboardHeader({ user, chapterName, unreadCount, onNotifPress }) {
  return (
    <LinearGradient
      colors={Colors.gradient.green}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <View style={styles.topRow}>
        <View style={styles.logoRing}>
          <Logo size={48} style={styles.logo} />
        </View>
        <View style={styles.greeting}>
          <Text style={styles.welcome}>Welcome back,</Text>
          <BrushText variant="screenTitle" style={styles.name}>
            {user?.name || 'Volunteer'}
          </BrushText>
        </View>
        <TouchableOpacity onPress={onNotifPress} style={styles.bellWrap}>
          <View style={styles.bellCircle}>
            <Text style={styles.bellIcon}>&#x1F514;</Text>
          </View>
          {unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unreadCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
      {chapterName && (
        <View style={styles.chapterPill}>
          <View style={styles.chapterDot} />
          <Text style={styles.chapter}>{chapterName} Chapter</Text>
        </View>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 60,
    paddingHorizontal: 24,
    paddingBottom: 30,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logoRing: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  logo: {
    backgroundColor: Colors.cream,
  },
  greeting: {
    flex: 1,
  },
  welcome: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  name: {
    color: Colors.white,
    fontSize: 28,
    marginTop: -2,
  },
  bellWrap: {
    position: 'relative',
  },
  bellCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellIcon: {
    fontSize: 20,
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: Colors.pink,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    borderWidth: 2,
    borderColor: Colors.green,
  },
  badgeText: {
    color: Colors.white,
    fontSize: 10,
    fontWeight: '800',
  },
  chapterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 6,
  },
  chapterDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#6ECBA0',
  },
  chapter: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    fontWeight: '500',
  },
});
