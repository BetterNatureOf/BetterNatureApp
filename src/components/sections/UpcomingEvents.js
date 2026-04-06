import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Spacing } from '../../config/theme';
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
          <Text style={styles.emptyText}>No upcoming events right now</Text>
          <Text style={styles.emptySubtext}>Check back soon!</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <BrushText variant="sectionHeader" style={styles.header}>
        Upcoming Events
      </BrushText>
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
  header: {
    color: Colors.green,
    marginBottom: 12,
  },
  empty: {
    backgroundColor: Colors.white,
    borderRadius: 18,
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 15,
    color: Colors.dark,
    fontWeight: '500',
  },
  emptySubtext: {
    fontSize: 13,
    color: Colors.gray,
    marginTop: 4,
  },
});
