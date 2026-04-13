import React from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from '../ui/BrushText';

export default function MemberOfMonth({ member, onCongrats, onHeart }) {
  if (!member) return null;

  const user = member.users || {};

  return (
    <View style={styles.container}>
      <BrushText variant="sectionHeader" style={styles.header}>
        Member of the Month
      </BrushText>
      <View style={styles.card}>
        <View style={styles.avatarWrap}>
          <LinearGradient
            colors={Colors.gradient.sunset}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.avatarRing}
          >
            {user.avatar_url ? (
              <Image source={{ uri: user.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Text style={styles.avatarInitial}>
                  {(user.name || '?')[0].toUpperCase()}
                </Text>
              </View>
            )}
          </LinearGradient>
        </View>
        <View style={styles.starBadge}>
          <Text style={styles.starText}>{'\u2B50'}</Text>
        </View>
        <Text style={styles.name}>{user.name || 'Member'}</Text>
        {member.quote && (
          <Text style={styles.quote}>"{member.quote}"</Text>
        )}
        <View style={styles.actions}>
          <TouchableOpacity onPress={onCongrats} style={styles.actionBtn}>
            <Text style={styles.actionEmoji}>{'\u{1F389}'}</Text>
            <Text style={styles.actionCount}>{member.congrats_count || 0}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onHeart} style={styles.actionBtn}>
            <Text style={styles.actionEmoji}>{'\u2764\uFE0F'}</Text>
            <Text style={styles.actionCount}>{member.hearts_count || 0}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 24,
    marginTop: 24,
  },
  header: {
    color: Colors.green,
    marginBottom: 14,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    ...Shadows.card,
  },
  avatarWrap: {
    marginBottom: 14,
  },
  avatarRing: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 3,
    borderColor: Colors.white,
  },
  avatarPlaceholder: {
    backgroundColor: Colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.pink,
  },
  starBadge: {
    position: 'absolute',
    top: 28,
    right: '50%',
    marginRight: -50,
  },
  starText: {
    fontSize: 18,
  },
  name: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.dark,
    letterSpacing: -0.2,
  },
  quote: {
    ...Type.caption,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 12,
  },
  actions: {
    flexDirection: 'row',
    marginTop: 18,
    gap: 24,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.grayFaint,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    gap: 6,
  },
  actionEmoji: {
    fontSize: 18,
  },
  actionCount: {
    fontSize: 14,
    color: Colors.gray,
    fontWeight: '600',
  },
});
