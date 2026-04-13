import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Spacing, Radius, Shadows } from '../../config/theme';
import BrushText from '../ui/BrushText';
import EventCard from '../ui/EventCard';

export default function UpcomingEvents({ events = [], onEventPress }) {
  if (!events.length) {
    return (
      <View style={styles.container}>
        <BrushText variant="sectionHeader" style={styles.header}>
          Upcoming Events
        </BrushText>
        <View style={styles.empty}>
          <View style={styles.emptyIconWrap}>
            <Text style={styles.emptyIcon}>{'\u{1F331}'}</Text>
          </View>
          <Text style={styles.emptyText}>No upcoming events right now</Text>
          <Text style={styles.emptySubtext}>Check back soon!</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <BrushText variant="sectionHeader" style={styles.header}>
          Upcoming Events
        </BrushText>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{events.length}</Text>
        </View>
      </View>
      {events.slice(0, 5).map((event) => (
        <EventCard
          key={event.id}
          event={event}
          onPress={() => onEventPress(event)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 24,
    marginTop: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  header: {
    color: Colors.green,
  },
  countBadge: {
    backgroundColor: Colors.greenLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  countText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.green,
  },
  empty: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: 36,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    ...Shadows.soft,
  },
  emptyIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.greenLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyIcon: {
    fontSize: 28,
  },
  emptyText: {
    fontSize: 15,
    color: Colors.dark,
    fontWeight: '600',
  },
  emptySubtext: {
    fontSize: 13,
    color: Colors.grayMid,
    marginTop: 4,
  },
});
