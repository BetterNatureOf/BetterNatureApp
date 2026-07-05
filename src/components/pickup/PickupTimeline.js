// Visual progress indicator for a food pickup — five stops between
// "posted" and "delivered" so both the restaurant and the volunteer
// can see exactly where the run is at a glance.
//
// Stages:
//   1. Posted        — pickup created, waiting for a volunteer
//   2. Claimed       — a volunteer took it, has not left yet
//   3. Confirmed     — restaurant tapped "confirm pickup" (proof of handoff)
//   4. En route      — volunteer physically has the food and is driving
//   5. Delivered     — food landed in the fridge
//
// Cancelled pickups render a single red row instead of the ladder.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Type } from '../../config/theme';

function stageIndex(pickup) {
  if (!pickup) return 0;
  if (pickup.status === 'completed') return 5;
  if (pickup.status === 'enroute') return 4;
  if (pickup.verified_by_restaurant_at) return 3;
  if (pickup.status === 'claimed') return 2;
  return 1;
}

const STAGES = [
  { key: 'posted',    label: 'Posted' },
  { key: 'claimed',   label: 'Claimed' },
  { key: 'confirmed', label: 'Confirmed by restaurant' },
  { key: 'enroute',   label: 'En route to drop' },
  { key: 'delivered', label: 'Delivered' },
];

export default function PickupTimeline({ pickup }) {
  if (pickup?.status === 'cancelled') {
    return (
      <View style={styles.cancelBar}>
        <Text style={styles.cancelText}>
          Cancelled{pickup.cancel_reason ? ` — ${pickup.cancel_reason}` : ''}
        </Text>
      </View>
    );
  }
  const current = stageIndex(pickup);
  return (
    <View style={styles.wrap}>
      {STAGES.map((s, i) => {
        const stageNo = i + 1;
        const done = stageNo <= current;
        const isNow = stageNo === current;
        return (
          <View key={s.key} style={styles.row}>
            <View style={styles.gutter}>
              <View style={[
                styles.dot,
                done && styles.dotDone,
                isNow && styles.dotNow,
              ]}>
                {done && !isNow ? <Text style={styles.check}>✓</Text> : null}
              </View>
              {i < STAGES.length - 1 ? (
                <View style={[styles.line, done && stageNo < current && styles.lineDone]} />
              ) : null}
            </View>
            <View style={{ flex: 1, paddingBottom: i < STAGES.length - 1 ? 14 : 0 }}>
              <Text style={[styles.label, isNow && styles.labelNow, done && styles.labelDone]}>
                {s.label}
              </Text>
              {isNow && stageNo < 5 ? (
                <Text style={styles.hint}>{hintFor(s.key, pickup)}</Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function hintFor(key, pickup) {
  if (key === 'posted') return 'Waiting for a volunteer.';
  if (key === 'claimed') return 'Volunteer heading to the restaurant.';
  if (key === 'confirmed') return 'Volunteer has the food, on their way to the drop.';
  if (key === 'enroute') return 'Almost done — mark delivered when the food is in the fridge.';
  return '';
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  row: { flexDirection: 'row' },
  gutter: { width: 22, alignItems: 'center' },
  dot: {
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: Colors.grayLight,
    borderWidth: 2, borderColor: Colors.grayLight,
    alignItems: 'center', justifyContent: 'center',
  },
  dotDone: { backgroundColor: Colors.green, borderColor: Colors.green },
  dotNow: { backgroundColor: Colors.pink, borderColor: Colors.pink },
  check: { color: '#FFF', fontSize: 10, fontWeight: '800', lineHeight: 10 },
  line: { width: 2, flex: 1, backgroundColor: Colors.grayLight, marginTop: 2 },
  lineDone: { backgroundColor: Colors.green },
  label: { fontSize: 13, fontWeight: '600', color: Colors.grayMid, marginLeft: 4 },
  labelNow: { color: Colors.pink, fontWeight: '800' },
  labelDone: { color: Colors.dark },
  hint: { fontSize: 11, color: Colors.grayMid, marginLeft: 4, marginTop: 2 },
  cancelBar: {
    backgroundColor: '#FCE3E3',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  cancelText: { fontSize: 13, fontWeight: '700', color: '#8E1B1B' },
});
