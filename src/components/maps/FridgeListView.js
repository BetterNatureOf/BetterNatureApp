// Fridge list — sorted by distance from the member (closest first).
// Each row collapses to a one-liner; tapping expands the full address,
// hours, capacity, and an 'Open in Maps' button that hands off to the
// device's preferred maps app via openInMaps().
//
// If we don't have the member's coordinates (geolocation denied / no
// browser geo / no fallback ZIP), we fall back to alphabetical-by-city
// and surface a small banner so the user knows why ordering isn't
// distance-based.
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Linking } from 'react-native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import { openInMaps } from '../../services/maps';

// Haversine — miles between two lat/lng pairs. Good enough for
// 'how far is this fridge from me' UX; we round to one decimal.
function milesBetween(a, b) {
  if (!a || !b) return null;
  const R = 3958.7613;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const s = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

function formatMiles(mi) {
  if (mi == null) return '';
  if (mi < 0.1) return 'right here';
  if (mi < 10)  return `${mi.toFixed(1)} mi`;
  return `${Math.round(mi)} mi`;
}

function fridgeColor(f) {
  if (f.capacity === 'low')  return '#EF4444';
  if (f.capacity === 'high') return Colors.green;
  return Colors.pink;
}

export default function FridgeListView({ fridges = [], userLocation }) {
  const [openId, setOpenId] = useState(null);

  const ordered = useMemo(() => {
    if (userLocation) {
      return [...fridges]
        .map((f) => ({
          f,
          mi: (f.lat != null && f.lng != null) ? milesBetween(userLocation, [f.lat, f.lng]) : Infinity,
        }))
        .sort((a, b) => a.mi - b.mi);
    }
    return [...fridges]
      .sort((a, b) => (a.city || '').localeCompare(b.city || '') || (a.name || '').localeCompare(b.name || ''))
      .map((f) => ({ f, mi: null }));
  }, [fridges, userLocation]);

  function openMaps(f) {
    if (Platform.OS === 'web') {
      const url = (f.lat != null && f.lng != null)
        ? `https://www.google.com/maps/dir/?api=1&destination=${f.lat},${f.lng}`
        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([f.name, f.address, f.city, f.state].filter(Boolean).join(', '))}`;
      Linking.openURL(url);
    } else {
      openInMaps({ address: f.address, lat: f.lat, lng: f.lng, label: f.name });
    }
  }

  function copyAddress(addr) {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(addr).catch(() => {});
    }
  }

  if (!fridges.length) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>No fridges yet</Text>
        <Text style={styles.emptyBody}>The fridge network is brand new. Check back as chapters add drop-off points.</Text>
      </View>
    );
  }

  return (
    <View>
      {!userLocation ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            Sorted alphabetically. Allow location access (or set your ZIP in Profile) to see what's closest to you.
          </Text>
        </View>
      ) : null}

      {ordered.map(({ f, mi }) => {
        const open = openId === f.id;
        return (
          <TouchableOpacity
            key={f.id}
            activeOpacity={0.9}
            onPress={() => setOpenId(open ? null : f.id)}
            style={[styles.row, open && styles.rowOpen]}
          >
            <View style={[styles.dot, { backgroundColor: fridgeColor(f) }]} />
            <View style={{ flex: 1 }}>
              <View style={styles.rowHead}>
                <Text style={styles.name}>{f.name || '(unnamed fridge)'}</Text>
                {mi != null && mi !== Infinity ? (
                  <Text style={styles.distance}>{formatMiles(mi)}</Text>
                ) : null}
              </View>
              <Text style={styles.cityLine}>
                {[f.city, f.state].filter(Boolean).join(', ') || 'Location unknown'}
              </Text>

              {open ? (
                <View style={styles.detail}>
                  {f.address ? (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailKey}>Address</Text>
                      <Text style={styles.detailVal} selectable>{f.address}</Text>
                    </View>
                  ) : null}
                  {f.hours ? (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailKey}>Hours</Text>
                      <Text style={styles.detailVal}>{f.hours}</Text>
                    </View>
                  ) : null}
                  {f.capacity ? (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailKey}>Capacity</Text>
                      <Text style={styles.detailVal}>{f.capacity}</Text>
                    </View>
                  ) : null}

                  <View style={styles.detailBtnRow}>
                    <TouchableOpacity style={styles.primaryBtn} onPress={() => openMaps(f)}>
                      <Text style={styles.primaryBtnText}>Open in Maps</Text>
                    </TouchableOpacity>
                    {Platform.OS === 'web' && f.address ? (
                      <TouchableOpacity style={styles.secondaryBtn} onPress={() => copyAddress(f.address)}>
                        <Text style={styles.secondaryBtnText}>Copy address</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              ) : null}
            </View>
            <Text style={[styles.chevron, open && styles.chevronOpen]}>{open ? '▾' : '›'}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { padding: 30, alignItems: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: Colors.green },
  emptyBody: { ...Type.body, color: Colors.gray, textAlign: 'center', marginTop: 6 },

  banner: {
    backgroundColor: '#FEF9C3', borderRadius: 12, padding: 12, marginBottom: 12,
    borderWidth: 1, borderColor: '#FDE68A',
  },
  bannerText: { fontSize: 12, color: '#854D0E', lineHeight: 18 },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.white, borderRadius: 14, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: Colors.glassBorder,
  },
  rowOpen: { ...Shadows.card, borderColor: Colors.green },
  dot: { width: 14, height: 14, borderRadius: 7, marginTop: 4, alignSelf: 'flex-start' },
  rowHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  name: { fontSize: 15, fontWeight: '700', color: Colors.dark, flex: 1 },
  distance: { fontSize: 13, fontWeight: '800', color: Colors.green },
  cityLine: { ...Type.caption, marginTop: 2 },
  chevron: { fontSize: 22, color: Colors.grayMid, alignSelf: 'flex-start', marginTop: 2 },
  chevronOpen: { fontSize: 16 },

  detail: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.grayLight, gap: 8 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  detailKey: { fontSize: 12, color: Colors.grayMid, fontWeight: '700' },
  detailVal: { fontSize: 13, color: Colors.dark, textAlign: 'right', flexShrink: 1 },
  detailBtnRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  primaryBtn: { backgroundColor: Colors.green, paddingVertical: 10, paddingHorizontal: 14, borderRadius: Radius.pill, flexGrow: 1, alignItems: 'center' },
  primaryBtnText: { color: '#FFF', fontWeight: '700', fontSize: 13 },
  secondaryBtn: { backgroundColor: 'transparent', paddingVertical: 10, paddingHorizontal: 14, borderRadius: Radius.pill, borderWidth: 1, borderColor: Colors.green, alignItems: 'center' },
  secondaryBtnText: { color: Colors.green, fontWeight: '700', fontSize: 13 },
});
