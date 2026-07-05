// Contact card for a live pickup — shows the OTHER side of the
// handoff so the person looking at the screen can call/text if
// something goes wrong at the door.
//
// Volunteer sees: the restaurant contact name + phone (they call
// when the door is locked, side entrance, etc.).
// Restaurant sees: the volunteer's name + phone (they call when
// nobody shows up 15 minutes past the window).
//
// Phone number is tel:-linked so tapping it dials on mobile and
// pops the FaceTime / Meet handler on web.
import React from 'react';
import { View, Text, StyleSheet, Linking, Platform, TouchableOpacity } from 'react-native';
import { Colors, Type, Radius } from '../../config/theme';

function digits(s) { return String(s || '').replace(/[^\d+]/g, ''); }

function tel(phone) {
  const d = digits(phone);
  if (!d) return null;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.location.href = `tel:${d}`;
    return;
  }
  Linking.openURL(`tel:${d}`).catch(() => {});
}

function sms(phone) {
  const d = digits(phone);
  if (!d) return null;
  const url = Platform.OS === 'ios' ? `sms:${d}` : `sms:${d}?body=`;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.location.href = `sms:${d}`;
    return;
  }
  Linking.openURL(url).catch(() => {});
}

// side: 'volunteer' shows the restaurant contact; 'restaurant' shows the volunteer.
export default function PickupContacts({ pickup, side }) {
  const showsRestaurant = side === 'volunteer';
  const name = showsRestaurant
    ? (pickup?.restaurant_contact_name || pickup?.restaurant_name || 'Restaurant')
    : (pickup?.claimant_name || 'Volunteer');
  const phone = showsRestaurant ? pickup?.restaurant_phone : pickup?.claimant_phone;
  const label = showsRestaurant ? 'Restaurant contact' : 'Volunteer';
  const help = showsRestaurant
    ? 'Call or text if you can\'t find the pickup entrance, or if nobody\'s at the counter.'
    : 'Call or text if the volunteer is late — they can update you on their ETA.';

  return (
    <View style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.name}>{name}</Text>
      {phone ? (
        <View style={styles.actions}>
          <TouchableOpacity onPress={() => tel(phone)} activeOpacity={0.85} style={styles.btnPrimary}>
            <Text style={styles.btnPrimaryText}>📞 {phone}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => sms(phone)} activeOpacity={0.85} style={styles.btnSecondary}>
            <Text style={styles.btnSecondaryText}>Text</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <Text style={styles.noPhone}>No phone on file. Ask an exec to update the profile.</Text>
      )}
      <Text style={styles.help}>{help}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFF9EC',
    borderRadius: Radius.lg,
    padding: 14,
    marginBottom: 14,
    borderLeftWidth: 4,
    borderLeftColor: '#E0A52F',
  },
  label: { fontSize: 11, fontWeight: '800', color: '#7A5400', letterSpacing: 0.6, textTransform: 'uppercase' },
  name: { fontSize: 16, fontWeight: '800', color: Colors.dark, marginTop: 4, marginBottom: 8 },
  actions: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  btnPrimary: {
    flex: 1, paddingVertical: 10, paddingHorizontal: 12,
    backgroundColor: Colors.green, borderRadius: 10, alignItems: 'center',
  },
  btnPrimaryText: { color: '#FFF', fontWeight: '800', fontSize: 14 },
  btnSecondary: {
    paddingVertical: 10, paddingHorizontal: 14,
    backgroundColor: Colors.white, borderRadius: 10, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.glassBorder,
  },
  btnSecondaryText: { color: Colors.green, fontWeight: '800', fontSize: 14 },
  noPhone: { ...Type.caption, fontStyle: 'italic', color: '#7A5400', marginBottom: 6 },
  help: { fontSize: 12, color: '#7A5400', lineHeight: 17 },
});
