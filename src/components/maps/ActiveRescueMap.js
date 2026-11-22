// Active rescue: one journey and the next required action.
// The map frames the stops above the card; the route line appears only when
// the server returns real road geometry (getRescueRoute → Mapbox
// Directions). It is a preview from the volunteer's approximate area, not
// turn-by-turn navigation and not traffic-aware, and says so. Open in Maps
// hands off to the phone's navigation app.
import React, { useEffect, useMemo, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '../../config/theme';
import { openDirections } from '../../services/maps';
import { getRescueRoute } from '../../services/database';
import RescueMap from './RescueMap';

const MODE = { driving: 'drive', cycling: 'ride', walking: 'walk' };

export default function ActiveRescueMap({ pickupId, stop, stops = [], droppingOff, action, status, online = true }) {
  const [route, setRoute] = useState({ state: 'loading' });
  const key = `${pickupId}|${droppingOff}`;
  useEffect(() => {
    let alive = true;
    if (!pickupId || !online) { setRoute({ state: online ? 'none' : 'offline' }); return undefined; }
    setRoute({ state: 'loading' });
    getRescueRoute(pickupId).then((r) => alive && setRoute(r?.status === 'ok' ? { state: 'ok', ...r } : { state: 'none', error: r?.error }))
      .catch(() => alive && setRoute({ state: 'none', error: 'network' }));
    return () => { alive = false; };
  }, [key, online]); // eslint-disable-line react-hooks/exhaustive-deps

  const { lat, lng, name, address } = stop;
  const hasPoint = Number.isFinite(lat) && Number.isFinite(lng);
  const destination = hasPoint ? { lat, lng } : address;
  const mapStops = useMemo(() => stops.filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng)), [stops]);
  const routeLabel = route.state === 'ok'
    ? `Route preview · about ${Math.round(route.seconds / 60)} min ${MODE[route.profile] || 'trip'}${route.origin === 'approximate_area' ? ' from your approximate area' : ''} · not turn-by-turn, not live traffic`
    : route.state === 'loading' ? 'Loading route preview…'
      : route.state === 'offline' ? 'Offline · stops shown without a route'
        : 'Road route unavailable · stops shown without a connecting line';
  const appleUrl = destination ? `https://maps.apple.com/?daddr=${encodeURIComponent(hasPoint ? `${lat},${lng}` : address)}` : null;

  return (
    <View style={styles.wrap}>
      {mapStops.length > 0 && (
        <RescueMap mode="trip" stops={mapStops} route={route.state === 'ok' ? { geometry: route.geometry } : null}
          height={Platform.OS === 'web' ? 'clamp(260px, 42dvh, 420px)' : 320} ariaLabel="Map of this rescue’s stops" />
      )}
      <Text style={styles.routeLabel} accessibilityLiveRegion="polite">{routeLabel}</Text>
      <View style={styles.card}>
        <Text style={styles.kicker}>{droppingOff ? 'NEXT STOP · DROP-OFF' : 'NEXT STOP · PICKUP'}</Text>
        <Text accessibilityRole="header" style={styles.title}>{name}</Text>
        {!!address && <Text selectable style={styles.meta}>{address}</Text>}
        {!!status && <Text style={styles.meta}>{status}</Text>}
        {action}
        {destination ? (
          <View style={styles.links}>
            <Pressable accessibilityRole="link" onPress={() => (Platform.OS === 'web' ? window.open(appleUrl, '_blank', 'noopener,noreferrer') : Linking.openURL(appleUrl))}
              style={[styles.linkBtn, !action && styles.linkPrimary]}>
              <Text style={[styles.linkText, !action && styles.linkTextPrimary]}>Open in Apple Maps ↗</Text>
            </Pressable>
            <Pressable accessibilityRole="link" onPress={() => openDirections({ destination, label: name })} style={styles.linkBtn}>
              <Text style={styles.linkText}>Open in Google Maps ↗</Text>
            </Pressable>
          </View>
        ) : <Text style={styles.meta}>Address unavailable. Check the details below or contact the partner.</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 16, gap: 8 },
  routeLabel: { fontSize: 12, color: Colors.gray, lineHeight: 17, paddingHorizontal: 4 },
  card: { backgroundColor: Colors.cream, borderRadius: 20, borderWidth: 1, borderColor: '#E4DED4', padding: 18, gap: 8 },
  kicker: { color: Colors.green, fontWeight: '700', fontSize: 12, letterSpacing: 0.4 },
  title: { color: Colors.dark, fontWeight: '700', fontSize: 21 },
  meta: { color: Colors.gray, fontSize: 14, lineHeight: 20 },
  links: { gap: 4, marginTop: 4 },
  linkBtn: { minHeight: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  linkPrimary: { backgroundColor: Colors.green },
  linkText: { color: Colors.green, fontWeight: '600', fontSize: 15 },
  linkTextPrimary: { color: Colors.white },
});
