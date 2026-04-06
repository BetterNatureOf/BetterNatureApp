import React from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
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
          {user.avatar_url ? (
            <Image source={{ uri: user.avatar_url }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Text style={styles.avatarInitial}>
                {(user.name || '?')[0].toUpperCase()}
              </Text>
            </View>
          )}
        </View>
        <Text style={styles.name}>{user.name || 'Member'}</Text>
        {member.quote && (
          <Text style={styles.quote}>"{member.quote}"</Text>
        )}
        <View style={styles.actions}>
          <TouchableOpacity onPress={onCongrats} style={styles.actionBtn}>
            <Text style={styles.actionEmoji}>🎉</Text>
            <Text style={styles.actionCount}>{member.congrats_count || 0}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onHeart} style={styles.actionBtn}>
            <Text style={styles.actionEmoji}>❤️</Text>
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
    marginBottom: 12,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: 24,
    alignItems: 'center',
    ...Shadows.card,
  },
  avatarWrap: {
    marginBottom: 12,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
  },
  avatarPlaceholder: {
    backgroundColor: Colors.pinkLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.pink,
  },
  name: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.dark,
  },
  quote: {
    ...Type.caption,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 6,
    paddingHorizontal: 12,
  },
  actions: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 24,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionEmoji: {
    fontSize: 20,
  },
  actionCount: {
    fontSize: 14,
    color: Colors.gray,
    fontWeight: '600',
  },
});
