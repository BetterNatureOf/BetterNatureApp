import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import ProjectTag from './ProjectTag';

/**
 * EventCard — event list item with project tag, title, date, location, and spots.
 */
export default function EventCard({ event, onPress, style }) {
  const spotsLeft = (event.total_spots || 20) - (event.filled_spots || 0);

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      style={[styles.card, style]}
    >
      <View style={styles.header}>
        <ProjectTag project={event.project} />
        <Text style={styles.spots}>
          {spotsLeft} spot{spotsLeft !== 1 ? 's' : ''} left
        </Text>
      </View>

      <Text style={styles.title}>{event.title}</Text>

      <View style={styles.details}>
        <Text style={styles.detail}>{event.date}</Text>
        {event.time && <Text style={styles.detail}> · {event.time}</Text>}
      </View>

      {event.location && (
        <Text style={styles.location} numberOfLines={1}>
          {event.location}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: 16,
    marginBottom: 12,
    ...Shadows.card,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  spots: {
    fontSize: 12,
    color: Colors.gray,
  },
  title: {
    ...Type.body,
    fontWeight: '600',
    color: Colors.dark,
    marginBottom: 4,
  },
  details: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detail: {
    ...Type.caption,
  },
  location: {
    ...Type.caption,
    marginTop: 2,
  },
});
