// Coordinator-only list of nearby volunteers for an open rescue, from the
// suggestRescueVolunteers callable. It suggests; it never assigns.
import React, { useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import Button from '../ui/Button';
import { Colors } from '../../config/theme';
import { suggestRescueVolunteers } from '../../services/database';

const TIMING = {
  can_make_pickup: 'Can reach the pickup in time',
  too_far_for_pickup_cutoff: 'Too far to make the pickup cutoff',
  unknown: 'Travel time unknown',
};
const FIT = { fits: 'Vehicle fits', does_not_fit: 'Vehicle doesn’t fit', unknown: 'Vehicle fit unknown' };
const GAPS = {
  road_times: 'road times (routing service not configured)',
  food_category: 'food type',
  packages: 'package count',
  receiving_site_details: 'receiving site hours and capacity',
  donor_location: 'the donor’s location',
};

export default function RescueSuggestions({ pickupId }) {
  const [state, setState] = useState({ loading: false, data: null, error: '' });
  async function load() {
    setState({ loading: true, data: null, error: '' });
    try {
      setState({ loading: false, data: await suggestRescueVolunteers(pickupId), error: '' });
    } catch (e) {
      setState({ loading: false, data: null, error: e?.message || 'Could not load suggestions.' });
    }
  }
  const { loading, data, error } = state;
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Nearby volunteers</Text>
      <Text style={styles.help}>Volunteers who shared their area in the last hour, are free, and are approved in this chapter.</Text>
      {!data && !loading && <Button title="Suggest volunteers" variant="secondary" onPress={load} />}
      {loading && <ActivityIndicator color={Colors.green} />}
      {!!error && <Text style={styles.error}>{error}</Text>}
      {data && (
        <>
          {data.candidates.length === 0 && <Text style={styles.empty}>No one nearby is sharing their area right now.</Text>}
          {data.candidates.map((c) => (
            <View key={c.uid} style={styles.row} accessibilityRole="text">
              <Text style={styles.name}>{c.name}</Text>
              <Text style={styles.meta}>
                {c.road_minutes != null ? `${c.road_minutes} min drive` : `${c.distance_km} km away`} · {TIMING[c.timing]}
              </Text>
              <Text style={[styles.meta, c.fit === 'does_not_fit' && styles.warn]}>
                {FIT[c.fit]}{c.fit_problems.length ? ` (${c.fit_problems.join(', ')})` : ''}
                {c.full_trip.status === 'feasible' ? ` · full trip fits with ${c.full_trip.margin_minutes} min to spare` : ''}
              </Text>
            </View>
          ))}
          {data.gaps.length > 0 && (
            <Text style={styles.gaps}>Not yet known: {data.gaps.map((g) => GAPS[g] || g).join(', ')}.</Text>
          )}
          <Button title="Refresh" variant="secondary" onPress={load} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: Colors.grayLight, backgroundColor: Colors.white, borderRadius: 14, padding: 14, marginTop: 14, gap: 8 },
  title: { fontSize: 15, fontWeight: '700', color: Colors.dark },
  help: { fontSize: 13, color: Colors.gray, lineHeight: 18 },
  row: { borderTopWidth: 1, borderTopColor: Colors.grayFaint, paddingTop: 10 },
  name: { fontSize: 15, fontWeight: '600', color: Colors.dark },
  meta: { fontSize: 13, color: Colors.gray, marginTop: 2, lineHeight: 18 },
  warn: { color: '#7A4E0E' },
  empty: { fontSize: 14, color: Colors.gray },
  gaps: { fontSize: 13, color: Colors.gray, fontStyle: 'italic', lineHeight: 18 },
  error: { fontSize: 14, color: '#9B2C2C' },
});
