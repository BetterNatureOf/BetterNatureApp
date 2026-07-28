// Live countdown chip for an active pickup. Shows how much time
// remains in the restaurant's pickup window so the volunteer feels
// the actual urgency — a 3-hour window that's been sitting for 2h
// 45m is much more urgent than one posted 5 minutes ago, and the
// only way that difference registers today is a manual math trip
// on the volunteer's part.
//
// Sourced from pickup.pickup_window_until (ISO string) which
// createPickup stamps at post time. If missing (legacy pickups
// or 'date' mode without an until), render nothing.
//
// Tone flips with remaining time:
//   > 60 min → green (plenty of time)
//   15-60    → amber (heads up)
//   0-15     → red   (act now)
//   overdue  → red pulsing "overdue" copy
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../../config/theme';

function fmt(ms) {
  if (ms <= 0) return { text: 'Overdue', tone: 'overdue' };
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  let text;
  if (h > 0) text = `${h}h ${m}m left`;
  else text = `${m}m left`;
  let tone;
  if (totalMin > 60) tone = 'ok';
  else if (totalMin > 15) tone = 'warn';
  else tone = 'urgent';
  return { text, tone };
}

const TONES = {
  ok:      { bg: '#E5F2EC', fg: '#1B5E3F' },
  warn:    { bg: '#FFF2CF', fg: '#7A5400' },
  urgent:  { bg: '#FCE3E3', fg: '#8E1B1B' },
  overdue: { bg: '#FCE3E3', fg: '#8E1B1B' },
};

export default function PickupCountdown({ pickup, style }) {
  const until = pickup?.pickup_window_until
    ? new Date(pickup.pickup_window_until).getTime()
    : (pickup?.scheduled_for ? new Date(pickup.scheduled_for).getTime() : null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!until) return;
    const t = setInterval(() => setNow(Date.now()), 30000); // repaint every 30s
    return () => clearInterval(t);
  }, [until]);
  if (!until) return null;
  if (['completed', 'cancelled'].includes(pickup?.status)) return null;
  const { text, tone } = fmt(until - now);
  const t = TONES[tone];
  return (
    <View style={[styles.chip, { backgroundColor: t.bg }, style]}>
      <Text style={[styles.text, { color: t.fg }]}>
        {tone === 'overdue' ? '⏱ Overdue' : `⏱ ${text}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  text: { fontSize: 12, fontWeight: '800', letterSpacing: 0.3 },
});
