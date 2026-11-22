// What a volunteer sees about an offer for this rescue: a live exclusive
// offer with its countdown and trip estimate, someone else holding it, or
// why their own offer ended. Accept lives in the screen's main action and
// only shows success after the server confirms.
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Button from '../ui/Button';
import { Colors } from '../../config/theme';

const toMs = (v) => (v?.toMillis ? v.toMillis() : typeof v === 'string' ? Date.parse(v) : Number.isFinite(v) ? v : null);
const clock = (ms) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const MODE = { driving: 'driving', cycling: 'cycling', walking: 'walking' };
const ENDED = {
  expired: (at) => `Your offer expired${at ? ` at ${clock(at)}` : ''}. It moved to the next volunteer and may come back if nobody takes it.`,
  withdrawn: () => 'This offer was withdrawn: the rescue was taken, cancelled, or its destination changed.',
  declined: () => 'You passed on this rescue. That never counts against you.',
};

function useCountdown(until) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!until) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [until]);
  return until ? Math.max(0, until - now) : 0;
}

export function tripSentence(trip) {
  if (!trip || !Number.isFinite(trip.to_pickup_minutes)) return 'Travel time couldn’t be estimated.';
  const approx = trip.basis !== 'road';
  const mode = MODE[trip.profile] || 'driving';
  const legs = `about ${trip.to_pickup_minutes} min to the pickup${Number.isFinite(trip.to_site_minutes) ? ` and ${trip.to_site_minutes} min on to the drop-off` : ''}`;
  const basis = approx
    ? 'estimated from your approximate area by straight-line distance, not a road route'
    : 'road estimates from your approximate area, without live traffic';
  return `${legs[0].toUpperCase()}${legs.slice(1)}, ${mode}${trip.profile_assumed ? ' (vehicle not set)' : ''} — ${basis}.`
    + (trip.wait_minutes ? ` Includes about ${trip.wait_minutes} min waiting for the food or the site to be ready.` : '')
    + ` Planned with ${trip.margin_minutes ?? (approx ? 15 : 5)} min spare before each deadline, plus 10 min each to load and unload.`;
}

export default function RescueOfferPanel({ offer, latest, heldUntil, busy, onDecline }) {
  const expires = toMs(offer?.expires_at);
  const left = useCountdown(expires);
  if (offer && left > 0) {
    const m = Math.floor(left / 60000), sec = Math.floor((left % 60000) / 1000);
    return (
      <View style={styles.live} accessibilityRole="alert">
        <Text style={styles.liveTitle}>This rescue is offered to you</Text>
        <Text style={styles.countdown} accessibilityLabel={`Respond within ${m} minutes ${sec} seconds, by ${clock(expires)}`}>
          {m}:{String(sec).padStart(2, '0')} to respond · by {clock(expires)}
        </Text>
        {offer.expiry_reason === 'last_feasible_start' && (
          <Text style={styles.liveBody}>That’s the latest you could leave and still make both deadlines.</Text>
        )}
        <Text style={styles.liveBody}>{tripSentence(offer.trip)}</Text>
        <Text style={styles.liveBody}>Only you can accept it right now. Passing is fine and moves it to the next volunteer.</Text>
        <Button title="Pass on this one" variant="secondary" onPress={onDecline} disabled={busy} />
      </View>
    );
  }
  if (heldUntil) {
    return (
      <View style={styles.note} accessibilityRole="text">
        <Text style={styles.noteText}>Offered to another volunteer until {clock(heldUntil)}. If they pass, it may be offered to you.</Text>
      </View>
    );
  }
  if (latest && ENDED[latest.status] && latest.status !== 'accepted') {
    const ended = latest.status === 'open' ? 'expired' : latest.status;
    return (
      <View style={styles.note} accessibilityRole="text">
        <Text style={styles.noteText}>{ENDED[ended](toMs(latest.expires_at))}</Text>
      </View>
    );
  }
  if (latest?.status === 'open') {
    return <View style={styles.note}><Text style={styles.noteText}>{ENDED.expired(toMs(latest.expires_at))}</Text></View>;
  }
  return null;
}

const styles = StyleSheet.create({
  live: { backgroundColor: Colors.greenLight, borderRadius: 16, padding: 14, gap: 6, marginTop: 10 },
  liveTitle: { fontSize: 16, fontWeight: '700', color: Colors.green },
  countdown: { fontSize: 22, fontWeight: '700', color: Colors.dark, fontVariant: ['tabular-nums'] },
  liveBody: { fontSize: 14, color: Colors.dark, lineHeight: 20 },
  note: { backgroundColor: '#F4EFE6', borderRadius: 14, padding: 12, marginTop: 10 },
  noteText: { fontSize: 14, color: Colors.dark, lineHeight: 20 },
});
