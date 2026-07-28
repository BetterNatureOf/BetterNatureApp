import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from '../ui/BrushText';
import Icon from '../ui/Icon';
import PickupCountdown from '../pickup/PickupCountdown';
import { openInMaps, formatAddress } from '../../services/maps';

function statusLabel(status) {
  if (status === 'enroute') return 'EN ROUTE TO DROP-OFF';
  if (status === 'claimed') return 'HEADING TO PICKUP';
  return 'ASSIGNED TO YOU';
}
function fmtDate(pickup) {
  const iso = pickup.scheduled_for || pickup.pickup_window_until;
  if (!iso) return pickup.scheduled_date || '';
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch { return pickup.scheduled_date || ''; }
}
function fmtTime(pickup) {
  const iso = pickup.scheduled_for || pickup.pickup_window_until;
  if (!iso) return pickup.scheduled_time || '';
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  } catch { return pickup.scheduled_time || ''; }
}

/**
 * MyPickups — shows the volunteer's active/claimed pickups on their dashboard.
 *
 * Renders an explicit empty state if there's nothing to act on — a brand-new
 * member who lands on the home screen should never see a blank gap; they
 * should see a useful hint about what to do next.
 */
export default function MyPickups({ pickups = [], userId, onPickupPress, onClaimPress }) {
  // Show pickups the user has claimed (incl. en route — they're
  // still actively working it), OR available ones they can grab.
  // Without `enroute` here the card disappeared the moment they
  // tapped "I'm on my way" and they couldn't find their run.
  const myPickups = pickups.filter(
    (p) => p.claimed_by === userId && ['claimed', 'enroute'].includes(p.status)
  );
  const available = pickups.filter((p) => p.status === 'available');

  if (myPickups.length === 0 && available.length === 0) {
    return (
      <View style={styles.container}>
        <BrushText variant="sectionHeader" style={styles.header}>Pickups</BrushText>
        <View style={styles.emptyCard}>
          <View style={styles.emptyIconWrap}>
            <Icon name="clipboard" size={22} color={Colors.green} strokeWidth={2} />
          </View>
          <Text style={styles.emptyTitle}>No pickups available right now</Text>
          <Text style={styles.emptyBody}>
            When a partner restaurant posts surplus food in your chapter, it shows up here. We notify you the moment a new pickup goes live.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <BrushText variant="sectionHeader" style={styles.header}>
          Pickups
        </BrushText>
        {myPickups.length > 0 && (
          <View style={styles.activeBadge}>
            <View style={styles.activeDot} />
            <Text style={styles.activeText}>{myPickups.length} Active</Text>
          </View>
        )}
      </View>

      {/* Your active pickups — pinned, one glance answers "what next?" */}
      {myPickups.map((pickup) => {
        const restAddr = pickup.restaurant_address || formatAddress({
          street: pickup.restaurant_street,
          city: pickup.restaurant_city,
          state: pickup.restaurant_state,
          zip: pickup.restaurant_zip,
        });
        const dropTarget = pickup.status === 'enroute'
          ? (pickup.fridge_name || pickup.fridge_address || 'Chosen fridge')
          : (pickup.fridge_name || 'You choose on arrival');
        return (
          <TouchableOpacity
            key={pickup.id}
            style={styles.card}
            activeOpacity={0.8}
            onPress={() => onPickupPress?.(pickup)}
          >
            <LinearGradient
              colors={Colors.gradient.sage}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.statusBar}
            >
              <Text style={styles.statusText}>{statusLabel(pickup.status)}</Text>
            </LinearGradient>

            <View style={styles.cardBody}>
              <View style={styles.urgencyRow}>
                <PickupCountdown pickup={pickup} />
              </View>
              <View style={styles.restaurantRow}>
                <View style={styles.iconWrap}>
                  <Icon name="clipboard" size={20} color={Colors.green} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.restaurantName} numberOfLines={1}>{pickup.restaurant_name}</Text>
                  {restAddr ? <Text style={styles.address} numberOfLines={1}>{restAddr}</Text> : null}
                </View>
              </View>

              <View style={styles.detailsGrid}>
                <DetailCell label="Date" value={fmtDate(pickup)} />
                <DetailCell label="Time" value={fmtTime(pickup)} />
                <DetailCell label="Est. weight" value={pickup.estimated_weight_lbs ? `${pickup.estimated_weight_lbs} lbs` : '—'} />
                <DetailCell label="Drop-off" value={dropTarget} />
              </View>

              <View style={styles.ctaRow}>
                <TouchableOpacity
                  style={styles.primaryBtn}
                  activeOpacity={0.85}
                  onPress={() => onPickupPress?.(pickup)}
                >
                  <Text style={styles.primaryBtnText}>
                    {pickup.status === 'enroute' ? 'Complete drop-off →' : 'Continue pickup →'}
                  </Text>
                </TouchableOpacity>
                {restAddr ? (
                  <TouchableOpacity
                    style={styles.directionsBtn}
                    activeOpacity={0.85}
                    onPress={() => openInMaps({
                      address: restAddr,
                      lat: pickup.restaurant_lat,
                      lng: pickup.restaurant_lng,
                      label: pickup.restaurant_name,
                    })}
                  >
                    <Icon name="pin" size={14} color={Colors.green} />
                    <Text style={styles.directionsText}>Directions</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          </TouchableOpacity>
        );
      })}

      {/* Available pickups to claim */}
      {available.length > 0 && (
        <>
          <Text style={styles.availableHeader}>
            {available.length} available pickup{available.length !== 1 ? 's' : ''} near you
          </Text>
          {available.slice(0, 3).map((pickup) => (
            <TouchableOpacity
              key={pickup.id}
              style={styles.availableCard}
              activeOpacity={0.8}
              onPress={() => onClaimPress?.(pickup)}
            >
              <View style={styles.availableLeft}>
                <View style={[styles.iconWrapSmall, { backgroundColor: Colors.amberLight }]}>
                  <Icon name="clipboard" size={16} color={Colors.green} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={styles.availableTitleRow}>
                    <Text style={styles.availableName} numberOfLines={1}>{pickup.restaurant_name}</Text>
                    <PickupCountdown pickup={pickup} style={styles.availableCountdown} />
                  </View>
                  <Text style={styles.availableSub} numberOfLines={1}>
                    {fmtDate(pickup)} {'\u00B7'} {fmtTime(pickup)}{pickup.estimated_weight_lbs ? ` \u00B7 ${pickup.estimated_weight_lbs} lbs` : ''}
                  </Text>
                </View>
              </View>
              <View style={styles.claimBtn}>
                <Text style={styles.claimText}>Claim</Text>
              </View>
            </TouchableOpacity>
          ))}
        </>
      )}
    </View>
  );
}

function DetailCell({ label, value }) {
  return (
    <View style={styles.detailItem}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue} numberOfLines={1}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 24,
    marginTop: 24,
  },
  emptyCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: 22,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    ...Shadows.soft,
  },
  emptyIconWrap: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: Colors.greenLight,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: Colors.dark, marginBottom: 4 },
  emptyBody: { ...Type.caption, lineHeight: 19 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  header: {
    color: Colors.green,
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.greenLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    gap: 5,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.green,
  },
  activeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.green,
  },

  // Active pickup card
  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    ...Shadows.card,
  },
  statusBar: {
    paddingVertical: 6,
    alignItems: 'center',
  },
  statusText: {
    ...Type.eyebrow,
    color: Colors.white,
    fontSize: 10,
  },
  cardBody: {
    padding: 18,
  },
  restaurantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: Colors.sageLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  icon: { fontSize: 20 },
  restaurantName: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.dark,
    letterSpacing: -0.2,
  },
  address: {
    fontSize: 13,
    color: Colors.gray,
    marginTop: 2,
    fontWeight: '500',
  },

  detailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '47%',
    backgroundColor: Colors.grayFaint,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },
  detailIcon: { fontSize: 16 },
  detailLabel: { fontSize: 10, color: Colors.grayMid, fontWeight: '600' },
  detailValue: { fontSize: 14, fontWeight: '700', color: Colors.dark, marginTop: 1 },

  urgencyRow: { marginBottom: 12 },
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  primaryBtn: {
    backgroundColor: Colors.green,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
    flexGrow: 1,
    alignItems: 'center',
  },
  primaryBtnText: { color: Colors.white, fontWeight: '800', fontSize: 14, letterSpacing: 0.2 },
  directionsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.greenLight,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  directionsIcon: { fontSize: 14 },
  directionsText: { fontSize: 13, fontWeight: '700', color: Colors.green },

  // Available pickups
  availableHeader: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.gray,
    marginTop: 8,
    marginBottom: 10,
  },
  availableCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    ...Shadows.soft,
  },
  availableLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  iconWrapSmall: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconSmall: { fontSize: 16 },
  availableTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  availableName: { fontSize: 14, fontWeight: '700', color: Colors.dark, flexShrink: 1 },
  availableCountdown: { paddingHorizontal: 8, paddingVertical: 2 },
  availableSub: { fontSize: 11, color: Colors.grayMid, marginTop: 2 },
  claimBtn: {
    backgroundColor: Colors.pink,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    marginLeft: 10,
  },
  claimText: { fontSize: 13, fontWeight: '700', color: Colors.white },
});
