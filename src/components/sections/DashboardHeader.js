import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors, Type, Spacing } from '../../config/theme';
import BrushText from '../ui/BrushText';

export default function DashboardHeader({ user, chapterName, unreadCount, onNotifPress }) {
  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <View style={styles.greeting}>
          <BrushText variant="screenTitle" style={styles.welcome}>
            Welcome back,
          </BrushText>
          <BrushText variant="screenTitle" style={styles.name}>
            {user?.name || 'Volunteer'}!
          </BrushText>
        </View>
        <TouchableOpacity onPress={onNotifPress} style={styles.bellWrap}>
          <Text style={styles.bellIcon}>🔔</Text>
          {unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unreadCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
      {chapterName && (
        <Text style={styles.chapter}>{chapterName} Chapter</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.green,
    paddingTop: 60,
    paddingHorizontal: 24,
    paddingBottom: 28,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  greeting: {
    flex: 1,
  },
  welcome: {
    color: Colors.white,
    fontSize: 22,
    opacity: 0.9,
  },
  name: {
    color: Colors.white,
    fontSize: 30,
  },
  bellWrap: {
    padding: 8,
    position: 'relative',
  },
  bellIcon: {
    fontSize: 24,
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: Colors.pink,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: Colors.white,
    fontSize: 10,
    fontWeight: '700',
  },
  chapter: {
    color: Colors.white,
    opacity: 0.75,
    fontSize: 14,
    marginTop: 6,
  },
});
