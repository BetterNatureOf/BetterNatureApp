// Coordinator view of where a rescue's volunteer search stands, read
// from pickups/{id}/dispatch/state (written by functions/rescueDispatch.js).
// Rules let only chapter staff read it; everyone else renders nothing.
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { Colors } from '../../config/theme';

const ROUND_COUNT = 3;
const toMs = (v) => (v?.toMillis ? v.toMillis() : null);
const clock = (ms) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

const ESCALATION_TEXT = {
  no_acceptance: 'No nearby volunteer accepted after every search round.',
  deadline_approaching: 'The pickup deadline is close and nobody has accepted.',
  not_started: 'The assigned volunteer hasn’t started and the pickup cutoff is close.',
};

export function describeDispatch(state, now = Date.now()) {
  if (!state) return null;
  const next = toMs(state.next_action_at);
  const last = state.last_round || {};
  const notes = [];
  if (last.location === 'missing') notes.push('The donor’s location is missing, so alerts can’t target nearby volunteers.');
  if (last.ranking === 'distance') notes.push('Road times unavailable — volunteers ranked by straight-line distance.');
  if (state.escalation && state.status !== 'closed') {
    return {
      tone: 'alert', title: 'Needs your decision',
      body: ESCALATION_TEXT[state.escalation.reason] || 'This rescue needs coordinator review.',
      meta: `Escalated ${clock(toMs(state.escalation.at) ?? now)} · ${state.alerted_count || 0} volunteers alerted`,
      notes,
    };
  }
  if (state.status === 'searching') {
    return {
      tone: 'info', title: state.round ? `Finding a volunteer · round ${state.round} of ${ROUND_COUNT}` : 'Starting the volunteer search',
      body: `${state.alerted_count || 0} nearby volunteer${state.alerted_count === 1 ? '' : 's'} alerted so far.`,
      meta: next ? (next <= now ? 'Next round is due now.' : `Next round ${clock(next)} if nobody accepts.`) : null,
      notes,
    };
  }
  if (state.status === 'assigned') {
    return {
      tone: 'ok', title: 'Volunteer assigned',
      body: state.start_reminder_at ? 'Start reminder sent to the volunteer.' : 'Waiting for the volunteer to start.',
      meta: next ? `Reminder at ${clock(next)} if they haven’t started.` : null,
      notes: [],
    };
  }
  return null;
}

export default function DispatchStatus({ pickupId }) {
  const [state, setState] = useState(null);
  useEffect(() => {
    if (!pickupId || !db) return undefined;
    return onSnapshot(doc(db, 'pickups', pickupId, 'dispatch', 'state'),
      (snap) => setState(snap.exists() ? snap.data() : null), () => setState(null));
  }, [pickupId]);
  const view = describeDispatch(state);
  if (!view) return null;
  const tone = TONES[view.tone];
  return (
    <View style={[styles.card, { backgroundColor: tone.bg, borderColor: tone.border }]} accessibilityRole="summary">
      <Text style={[styles.title, { color: tone.fg }]}>{view.title}</Text>
      <Text style={[styles.body, { color: tone.fg }]}>{view.body}</Text>
      {!!view.meta && <Text style={[styles.meta, { color: tone.fg }]}>{view.meta}</Text>}
      {view.notes.map((note) => <Text key={note} style={[styles.meta, { color: tone.fg }]}>{note}</Text>)}
    </View>
  );
}

const TONES = {
  info: { bg: Colors.greenLight, border: '#CFE2DA', fg: Colors.green },
  ok: { bg: Colors.sageLight, border: '#D3E6E6', fg: Colors.green },
  alert: { bg: Colors.amberLight, border: '#F4D9A8', fg: '#7A4E0E' },
};

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 14 },
  title: { fontSize: 15, fontWeight: '700' },
  body: { fontSize: 14, marginTop: 4, lineHeight: 20 },
  meta: { fontSize: 13, marginTop: 6, lineHeight: 18, opacity: 0.9 },
});
