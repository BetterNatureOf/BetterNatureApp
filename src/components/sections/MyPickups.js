import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from '../ui/BrushText';

/**
 * MyPickups — shows the volunteer's active/claimed pickups on their dashboard.
 * Only renders if there are pickups assigned to them.
 */
export default function MyPickups({ pickups = [], userId, onPickupPress, onClaimPress }) {
  // Show pickups the user has claimed, OR available ones they can grab
  const myPickups = pickups.filter((p) => p.claimed_by === userId && p.status === 'claimed');
  const available = pickups.filter((p) => p.status === 'available');

  if (myPickups.length === 0 && available.length === 0) return null;

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

      {/* Your active pickups */}
      {myPickups.map((pickup) => (
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
            <Text style={styles.statusText}>ASSIGNED TO YOU</Text>
          </LinearGradient>

          <View style={styles.cardBody}>
            <View style={styles.restaurantRow}>
              <View style={styles.iconWrap}>
                <Text style={styles.icon}>{'\u{1F37D}'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.restaurantName}>{pickup.restaurant_name}</Text>
                <Text style={styles.address}>{pickup.address}</Text>
              </View>
            </View>

            <View style={styles.detailsGrid}>
              <View style={styles.detailItem}>
                <Text style={styles.detailIcon}>{'\u{1F4C5}'}</Text>
                <View>
                  <Text style={styles.detailLabel}>Date</Text>
                  <Text style={styles.detailValue}>{pickup.scheduled_date}</Text>
                </View>
              </View>
              <View style={styles.detailItem}>
                <Text style={styles.detailIcon}>{'\u{1F552}'}</Text>
                <View>
                  <Text style={styles.detailLabel}>Time</Text>
                  <Text style={styles.detailValue}>{pickup.scheduled_time}</Text>
                </View>
              </View>
              <View style={styles.detailItem}>
                <Text style={styles.detailIcon}>{'\u{2696}'}</Text>
                <View>
                  <Text style={styles.detailLabel}>Est. Weight</Text>
                  <Text style={styles.detailValue}>{pickup.estimated_weight_lbs} lbs</Text>
                </View>
              </View>
              <View style={styles.detailItem}>
                <Text style={styles.detailIcon}>{'\u{1F372}'}</Text>
                <View>
                  <Text style={styles.detailLabel}>Est. Meals</Text>
                  <Text style={styles.detailValue}>~{Math.round(pickup.estimated_weight_lbs * 1.2)}</Text>
                </View>
              </View>
            </View>

            <View style={styles.ctaRow}>
              <View style={styles.directionsBtn}>
                <Text style={styles.directionsIcon}>{'\u{1F4CD}'}</Text>
                <Text style={styles.directionsText}>Get Directions</Text>
              </View>
            </View>
          </View>
        </TouchableOpacity>
      ))}

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
                  <Text style={styles.iconSmall}>{'\u{1F37D}'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.availableName}>{pickup.restaurant_name}</Text>
                  <Text style={styles.availableSub}>
                    {pickup.scheduled_date} {'\u00B7'} {pickup.scheduled_time} {'\u00B7'} {pickup.estimated_weight_lbs} lbs
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

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 24,
    marginTop: 24,
  },
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

  ctaRow: {
    alignItems: 'flex-start',
  },
  directionsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.greenLight,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
  },
  directionsIcon: { fontSize: 14 },
  directionsText: { fontSize: 13, fontWeight: '600', color: Colors.green },

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
  availableName: { fontSize: 14, fontWeight: '600', color: Colors.dark },
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
