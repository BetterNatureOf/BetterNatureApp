import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import ProjectTag from './ProjectTag';

/**
 * EventCard — event list item with project accent strip, title, date/location, and spots.
 */
export default function EventCard({ event, onPress, style }) {
  const spotsLeft = (event.total_spots || 20) - (event.filled_spots || 0);
  const projectColor = Colors.project[event.project]?.primary || Colors.sage;
  const urgentSpots = spotsLeft <= 3;

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      style={[styles.card, style]}
    >
      {/* Top accent bar */}
      <View style={[styles.accentBar, { backgroundColor: projectColor }]} />

      <View style={styles.body}>
        <View style={styles.header}>
          <ProjectTag project={event.project} />
          <View style={[
            styles.spotsBadge,
            { backgroundColor: urgentSpots ? Colors.pinkLight : Colors.grayFaint },
          ]}>
            <Text style={[
              styles.spotsText,
              { color: urgentSpots ? Colors.pink : Colors.gray },
            ]}>
              {spotsLeft} left
            </Text>
          </View>
        </View>

        <Text style={styles.title}>{event.title}</Text>

        <View style={styles.details}>
          <Text style={styles.detail}>{event.date}</Text>
          {event.time && <Text style={styles.detailDot}> · </Text>}
          {event.time && <Text style={styles.detail}>{event.time}</Text>}
        </View>

        {event.location && (
          <Text style={styles.location} numberOfLines={1}>
            {event.location}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    ...Shadows.card,
  },
  accentBar: {
    height: 3,
    width: '100%',
  },
  body: {
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  spotsBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  spotsText: {
    fontSize: 11,
    fontWeight: '600',
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.dark,
    marginBottom: 6,
    letterSpacing: -0.2,
  },
  details: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detail: {
    ...Type.caption,
    fontSize: 13,
  },
  detailDot: {
    color: Colors.grayMid,
    fontSize: 13,
  },
  location: {
    ...Type.caption,
    marginTop: 3,
    fontSize: 12,
  },
});
