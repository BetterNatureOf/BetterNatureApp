// Three plain steps every role reads the same way: has a receiving partner
// accepted, is a volunteer assigned, has the food been received. Shows
// who the next step is waiting on, without hiding custody.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../../config/theme';

const toMs = (v) => (v?.toMillis ? v.toMillis() : typeof v === 'string' ? Date.parse(v) : null);
const clock = (ms) => (ms ? new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '');

export function progressSteps(p) {
  const req = p.partner_request;
  const site = p.destination_confirmation;
  const partner = site
    ? { state: 'done', text: `${site.site_name} accepted` }
    : req?.status === 'awaiting_partner'
      ? { state: 'waiting', text: req.mode === 'preferred' ? `Waiting for ${req.site_name || 'your partner'} · answer by ${clock(toMs(req.respond_by))}` : `Offered to BN partners · answer by ${clock(toMs(req.respond_by))}` }
      : ['declined', 'expired'].includes(req?.status)
        ? { state: 'problem', text: req.status === 'declined' ? 'Partner declined — a coordinator will place it' : 'No partner answered — a coordinator will place it' }
        : { state: p.status === 'cancelled' ? 'idle' : 'waiting', text: 'Waiting for a receiving site' };
  const volunteer = p.claimed_by
    ? { state: 'done', text: `${p.claimant_name || 'A volunteer'} ${p.status === 'enroute' ? 'has the food' : 'is assigned'}` }
    : site && p.status === 'available' ? { state: 'waiting', text: 'Finding a volunteer' }
      : { state: 'idle', text: 'A volunteer is found after a partner accepts' };
  const received = p.receiving_receipt
    ? { state: 'done', text: `Received ${p.receiving_receipt.weight_lbs} lb${p.receiving_receipt.rejected_weight_lbs ? ` · ${p.receiving_receipt.rejected_weight_lbs} lb turned away` : ''}` }
    : p.status === 'enroute' ? { state: 'waiting', text: 'On the way to the receiving site' } : { state: 'idle', text: 'Not delivered yet' };
  if (p.safety_hold) received.state = 'problem';
  if (p.status === 'cancelled') return [{ state: 'problem', text: p.cancel_reason || 'Cancelled' }];
  return [
    { label: 'Receiving partner', ...partner },
    { label: 'Volunteer', ...volunteer },
    { label: 'Delivery', ...received },
  ];
}

const DOT = { done: Colors.green, waiting: Colors.amber, problem: '#B4532A', idle: Colors.grayLight };

export default function RescueProgress({ pickup }) {
  if (!pickup || pickup.status === 'completed') return null;
  const steps = progressSteps(pickup);
  return (
    <View style={styles.wrap} accessibilityRole="summary" accessibilityLabel={steps.map((s) => `${s.label || 'Status'}: ${s.text}`).join('. ')}>
      {steps.map((s, i) => (
        <View key={i} style={styles.row}>
          <View style={[styles.dot, { backgroundColor: DOT[s.state] }]} />
          <View style={{ flex: 1 }}>
            {!!s.label && <Text style={styles.label}>{s.label}</Text>}
            <Text style={styles.text}>{s.text}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: Colors.white, borderRadius: 14, borderWidth: 1, borderColor: Colors.grayLight, padding: 12, gap: 10, marginBottom: 12 },
  row: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 5 },
  label: { fontSize: 12, fontWeight: '700', color: Colors.gray, textTransform: 'uppercase', letterSpacing: 0.4 },
  text: { fontSize: 14, color: Colors.dark, lineHeight: 20 },
});
