// DoorDash-style pickup card. Two clear "rows" with tappable addresses:
//
//   ① PICK UP   ●─── from {restaurant_name}
//                    {restaurant_address}    [Open in Maps]
//
//   ② DROP OFF  ●─── at {fridge_name}
//                    {fridge_address}        [Navigate]
//
// Below: meal estimate, weight, window, photo, notes, primary CTA.
//
// The whole point is one glance answers "what, where from, where to."
// No emoji clutter, no vague microcopy, no buried addresses.
import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import AnimatedPressable from '../ui/AnimatedPressable';
import Icon from '../ui/Icon';
import Button from '../ui/Button';
import { openInMaps, formatAddress } from '../../services/maps';

export default function PickupCard({
  pickup,
  cta,                  // { label, onPress, disabled }
  showPhoto = true,
}) {
  if (!pickup) return null;
  const meals = pickup.meals_estimate || Math.round((pickup.estimated_weight_lbs || 0) * 1.2);
  const weight = pickup.actual_weight_lbs || pickup.estimated_weight_lbs;

  const restAddr = pickup.restaurant_address ||
    formatAddress({
      street: pickup.restaurant_street,
      city: pickup.restaurant_city,
      state: pickup.restaurant_state,
      zip: pickup.restaurant_zip,
    });
  const fridgeAddr = pickup.fridge_address ||
    formatAddress({
      street: pickup.fridge_street,
      city: pickup.fridge_city,
      state: pickup.fridge_state,
    });

  return (
    <View style={styles.card}>
      {/* Status pill */}
      <View style={styles.head}>
        <View style={[styles.pill, pillTone(pickup.status)]}>
          <Text style={styles.pillText}>{prettyStatus(pickup.status)}</Text>
        </View>
        <View style={styles.headStats}>
          {weight ? <Text style={styles.headStat}>{weight} lb</Text> : null}
          <Text style={styles.headStatStrong}>{meals} meals</Text>
        </View>
      </View>

      {/* Pick-up row */}
      <StopRow
        index="1"
        eyebrow="PICK UP"
        primary={pickup.restaurant_name || 'Restaurant'}
        secondary={restAddr}
        onOpenMaps={() => openInMaps({
          address: restAddr,
          lat: pickup.restaurant_lat, lng: pickup.restaurant_lng,
          label: pickup.restaurant_name,
        })}
        connector
      />

      {/* Drop-off row */}
      <StopRow
        index="2"
        eyebrow="DROP OFF"
        primary={pickup.fridge_name || 'Volunteer will choose'}
        secondary={fridgeAddr || 'Pick a community fridge when you arrive'}
        onOpenMaps={fridgeAddr ? () => openInMaps({
          address: fridgeAddr,
          lat: pickup.fridge_lat, lng: pickup.fridge_lng,
          label: pickup.fridge_name,
        }) : null}
        muted={!pickup.fridge_name}
      />

      {/* Optional photo + notes */}
      {showPhoto && pickup.photo_url ? (
        <Image source={{ uri: pickup.photo_url }} style={styles.photo} />
      ) : null}
      {pickup.notes ? (
        <View style={styles.notes}>
          <Icon name="info" size={14} color={Colors.gray} />
          <Text style={styles.notesText}>{pickup.notes}</Text>
        </View>
      ) : null}

      {/* Primary action */}
      {cta ? (
        <Button
          title={cta.label}
          onPress={cta.onPress}
          disabled={cta.disabled}
          loading={cta.loading}
          style={{ marginTop: 14 }}
        />
      ) : null}
    </View>
  );
}

function StopRow({ index, eyebrow, primary, secondary, onOpenMaps, connector, muted }) {
  return (
    <View style={styles.stop}>
      <View style={styles.stopRail}>
        <View style={[styles.stopDot, muted && styles.stopDotMuted]}>
          <Text style={styles.stopDotText}>{index}</Text>
        </View>
        {connector ? <View style={styles.stopLine} /> : null}
      </View>
      <View style={styles.stopBody}>
        <Text style={styles.stopEyebrow}>{eyebrow}</Text>
        <Text style={[styles.stopPrimary, muted && styles.stopPrimaryMuted]}>{primary}</Text>
        {secondary ? (
          <Text style={styles.stopSecondary}>{secondary}</Text>
        ) : null}
        {onOpenMaps ? (
          <AnimatedPressable
            style={styles.mapsBtn}
            scaleTo={0.97}
            onPress={onOpenMaps}
          >
            <Icon name="pin" size={14} color={Colors.green} />
            <Text style={styles.mapsBtnText}>Open in Maps</Text>
          </AnimatedPressable>
        ) : null}
      </View>
    </View>
  );
}

function prettyStatus(s) {
  switch (s) {
    case 'available': return 'Available';
    case 'claimed':   return 'Claimed — heading there';
    case 'enroute':   return 'En route to fridge';
    case 'completed': return 'Delivered';
    case 'cancelled': return 'Cancelled';
    default: return 'Available';
  }
}
function pillTone(s) {
  if (s === 'completed') return { backgroundColor: Colors.greenLight };
  if (s === 'claimed' || s === 'enroute') return { backgroundColor: '#FFE9CF' };
  if (s === 'cancelled') return { backgroundColor: '#F5D2D2' };
  return { backgroundColor: Colors.greenLight };
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    ...Shadows.card,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  pill: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: 99 },
  pillText: { fontSize: 11, fontWeight: '700', color: Colors.green, letterSpacing: 0.3 },
  headStats: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headStat: { ...Type.caption },
  headStatStrong: { fontSize: 13, fontWeight: '800', color: Colors.dark, letterSpacing: -0.2 },

  stop: { flexDirection: 'row', gap: 12 },
  stopRail: { alignItems: 'center', width: 22 },
  stopDot: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: Colors.green, alignItems: 'center', justifyContent: 'center',
  },
  stopDotMuted: { backgroundColor: Colors.grayMid },
  stopDotText: { color: Colors.white, fontSize: 11, fontWeight: '800' },
  stopLine: { width: 2, flex: 1, backgroundColor: Colors.green + '33', marginTop: 2, minHeight: 18 },
  stopBody: { flex: 1, paddingBottom: 14 },
  stopEyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2, color: Colors.gray },
  stopPrimary: { fontSize: 16, fontWeight: '700', color: Colors.dark, marginTop: 3, letterSpacing: -0.3 },
  stopPrimaryMuted: { color: Colors.gray, fontStyle: 'italic', fontWeight: '500' },
  stopSecondary: { ...Type.caption, marginTop: 2 },
  mapsBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingVertical: 6, paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: Colors.greenLight,
  },
  mapsBtnText: { fontSize: 12, fontWeight: '700', color: Colors.green, letterSpacing: 0.2 },
  photo: { width: '100%', height: 160, borderRadius: Radius.lg, marginTop: 4 },
  notes: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    marginTop: 10,
    padding: 10,
    backgroundColor: Colors.cream,
    borderRadius: 10,
  },
  notesText: { flex: 1, ...Type.caption },
});
