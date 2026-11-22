// Rescue map (iOS / Android) with @rnmapbox/maps.
//
// @rnmapbox/maps is native code: it works in a development or production
// build (expo prebuild / EAS) with the "@rnmapbox/maps" config plugin, not
// in Expo Go. When the native module or the public token is missing, this
// renders a plain notice and the screen's list, addresses, deadlines and
// "Open in Maps" actions carry the flow.
//
// Same interface as RescueMap.js (web): mode 'browse' | 'trip', points,
// selectedId, onSelect, stops, route (road geometry only; never a straight
// connector), children (bottom sheet).
import React, { useMemo, useRef, useState } from 'react';
import { NativeModules, Pressable, StyleSheet, Text, View, AccessibilityInfo } from 'react-native';
import { Colors } from '../../config/theme';
import { hasMapboxToken, MAPBOX_PUBLIC_TOKEN, MAPBOX_STYLE, MAPBOX_BASEMAP_CONFIG, MAP_COLORS, SHEET_PADDING } from '../../config/mapTheme';

let Mapbox = null;
const nativeAvailable = !!(NativeModules.RNMBXModule || NativeModules.RCTMGLModule);
if (nativeAvailable) {
  try {
    Mapbox = require('@rnmapbox/maps').default;           // eslint-disable-line global-require
    if (hasMapboxToken()) Mapbox.setAccessToken(MAPBOX_PUBLIC_TOKEN);
  } catch { Mapbox = null; }
}

const validPoint = (p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lng);
function bounds(points, route) {
  const coords = [...points.filter(validPoint).map((p) => [p.lng, p.lat]), ...(route?.geometry || [])];
  if (!coords.length) return null;
  const lngs = coords.map((c) => c[0]), lats = coords.map((c) => c[1]);
  return { ne: [Math.max(...lngs), Math.max(...lats)], sw: [Math.min(...lngs), Math.min(...lats)] };
}

export default function RescueMap({ mode = 'browse', points = [], selectedId, onSelect, stops = [], route = null, height = 360, children }) {
  const camera = useRef(null);
  const [failed, setFailed] = useState(false);
  const [reduce, setReduce] = useState(false);
  React.useEffect(() => { AccessibilityInfo.isReduceMotionEnabled?.().then(setReduce).catch(() => {}); }, []);
  const box = useMemo(() => bounds(mode === 'trip' ? stops : points, mode === 'trip' ? route : null), [mode, stops, points, route]);
  const framed = useRef(false);

  if (!Mapbox || !hasMapboxToken() || failed) {
    return (
      <View style={styles.notice} accessibilityRole="text">
        <Text style={styles.noticeText}>
          {failed ? 'The map couldn’t load. Everything you need is listed here.'
            : 'The map isn’t available in this version of the app. Addresses, times and directions are below.'}
        </Text>
        {children}
      </View>
    );
  }

  const fit = () => box && camera.current?.fitBounds(box.ne, box.sw,
    [SHEET_PADDING.top, SHEET_PADDING.right, mode === 'trip' ? 40 : SHEET_PADDING.bottom, SHEET_PADDING.left], reduce ? 0 : 500);
  const pickupShape = { type: 'FeatureCollection', features: points.filter(validPoint).map((p) => ({ type: 'Feature', id: p.id,
    geometry: { type: 'Point', coordinates: [p.lng, p.lat] }, properties: { id: p.id, soon: !!p.soon, selected: p.id === selectedId } })) };

  return (
    <View style={[styles.wrap, { height }]} accessible={false}>
      <Mapbox.MapView style={StyleSheet.absoluteFill} styleURL={MAPBOX_STYLE} scaleBarEnabled={false} pitchEnabled={false} rotateEnabled={false}
        attributionEnabled logoEnabled onMapLoadingError={() => setFailed(true)}
        onDidFinishLoadingMap={() => { if (!framed.current) { framed.current = true; setTimeout(fit, 0); } }}>
        <Mapbox.StyleImport id="basemap" existing config={MAPBOX_BASEMAP_CONFIG} />
        <Mapbox.Camera ref={camera} defaultSettings={{ centerCoordinate: [-90.05, 35.15], zoomLevel: 11 }} animationMode={reduce ? 'none' : 'easeTo'} />
        {mode === 'browse' && (
          <Mapbox.ShapeSource id="pickups" shape={pickupShape} cluster clusterRadius={48} clusterMaxZoomLevel={14}
            onPress={(e) => { const f = e.features?.[0]; if (f?.properties?.id) onSelect?.(f.properties.id); }}>
            <Mapbox.CircleLayer id="clusters" filter={['has', 'point_count']} slot="top"
              style={{ circleColor: MAP_COLORS.cluster, circleRadius: ['step', ['get', 'point_count'], 16, 5, 20, 15, 24], circleStrokeWidth: 3, circleStrokeColor: '#fff', circleEmissiveStrength: 1 }} />
            <Mapbox.SymbolLayer id="cluster-count" filter={['has', 'point_count']} slot="top"
              style={{ textField: ['get', 'point_count_abbreviated'], textSize: 13, textColor: '#fff', textAllowOverlap: true, textEmissiveStrength: 1 }} />
            <Mapbox.CircleLayer id="pickup-points" filter={['!', ['has', 'point_count']]} slot="top"
              style={{ circleColor: ['case', ['get', 'soon'], MAP_COLORS.pickupSoon, MAP_COLORS.pickup], circleRadius: ['case', ['get', 'selected'], 11, 8],
                circleStrokeWidth: ['case', ['get', 'selected'], 4, 2.5], circleStrokeColor: '#fff', circleEmissiveStrength: 1 }} />
          </Mapbox.ShapeSource>
        )}
        {mode === 'trip' && route?.geometry?.length > 1 && (
          <Mapbox.ShapeSource id="route" shape={{ type: 'Feature', geometry: { type: 'LineString', coordinates: route.geometry }, properties: {} }}>
            <Mapbox.LineLayer id="route-casing" slot="top" style={{ lineColor: MAP_COLORS.routeCasing, lineWidth: 9, lineCap: 'round', lineJoin: 'round', lineEmissiveStrength: 1 }} />
            <Mapbox.LineLayer id="route-line" slot="top" style={{ lineColor: MAP_COLORS.route, lineWidth: 5, lineCap: 'round', lineJoin: 'round', lineEmissiveStrength: 1 }} />
          </Mapbox.ShapeSource>
        )}
        {mode === 'trip' && stops.filter(validPoint).map((s, i) => (
          <Mapbox.PointAnnotation key={`${s.kind}-${i}`} id={`${s.kind}-${i}`} coordinate={[s.lng, s.lat]} title={s.label}>
            <View accessibilityLabel={s.label} style={[styles.stop, s.kind === 'destination' && styles.stopDest, s.kind === 'origin' && styles.stopOrigin]} />
          </Mapbox.PointAnnotation>
        ))}
      </Mapbox.MapView>
      <Pressable accessibilityRole="button" accessibilityLabel={mode === 'trip' ? 'Fit the whole route' : 'Show all pickups'} onPress={fit} style={styles.fit}>
        <Text style={styles.fitText}>{mode === 'trip' ? 'Fit route' : 'Show all'}</Text>
      </Pressable>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 24, overflow: 'hidden', backgroundColor: '#F1ECE3' },
  notice: { padding: 14, borderRadius: 16, backgroundColor: Colors.greenLight, gap: 8 },
  noticeText: { color: Colors.dark, fontSize: 14, lineHeight: 20 },
  fit: { position: 'absolute', top: 12, left: 12, minHeight: 44, minWidth: 44, paddingHorizontal: 12, borderRadius: 14, backgroundColor: Colors.cream,
    alignItems: 'center', justifyContent: 'center', shadowColor: '#20392E', shadowOpacity: 0.18, shadowRadius: 8, elevation: 3 },
  fitText: { color: Colors.green, fontWeight: '600', fontSize: 14 },
  stop: { width: 26, height: 26, borderRadius: 13, backgroundColor: MAP_COLORS.pickup, borderWidth: 3, borderColor: '#fff' },
  stopDest: { borderRadius: 7, backgroundColor: MAP_COLORS.destination },
  stopOrigin: { backgroundColor: 'transparent', borderStyle: 'dashed', borderColor: MAP_COLORS.pickup, width: 20, height: 20 },
});
