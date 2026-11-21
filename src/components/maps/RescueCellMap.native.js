import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { G, Polygon, Text as SvgText } from 'react-native-svg';
import { cellToBoundary, cellToLatLng } from '../../services/h3';
import { Colors } from '../../config/theme';

export default function RescueCellMap({ cells, selected, onSelect, summary, children }) {
  const shapes = cells.map((cell) => ({
    ...cell,
    boundary: cellToBoundary(cell.id),
    center: cellToLatLng(cell.id),
  }));
  const vertices = shapes.flatMap((shape) => shape.boundary);
  const south = Math.min(...vertices.map(([lat]) => lat));
  const west = Math.min(...vertices.map(([, lng]) => lng));
  const north = Math.max(...vertices.map(([lat]) => lat));
  const east = Math.max(...vertices.map(([, lng]) => lng));
  const longitudeScale = Math.cos((south + north) * Math.PI / 360);
  const width = (east - west) * longitudeScale;
  const height = north - south;
  const scale = Math.min(280 / width, 176 / height);
  const project = ([lat, lng]) => [
    160 + ((lng - west) * longitudeScale - width / 2) * scale,
    110 + (height / 2 - (lat - south)) * scale,
  ];

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>Pickup zones</Text>
      <Svg width="100%" height={220} viewBox="0 0 320 220" accessible={false}>
        {shapes.map(({ id, boundary, center, pickups, closingSoon }) => {
          const [x, y] = project(center);
          return (
            <G key={id} onPress={() => onSelect(id)}>
              <Polygon points={boundary.map((point) => project(point).join(',')).join(' ')}
                fill={id === selected ? Colors.green : closingSoon ? '#ffda90' : Colors.greenLight}
                stroke={Colors.green} strokeWidth={2} />
              <SvgText x={x} y={y + 5} textAnchor="middle" fontSize={15} fontWeight="bold"
                fill={id === selected ? Colors.cream : Colors.dark}>{pickups.length}</SvgText>
            </G>
          );
        })}
      </Svg>
      {summary}
      <View style={styles.controls}>
        {shapes.map(({ id, pickups, closingSoon }) => (
          <Pressable key={id} accessibilityRole="button" accessibilityState={{ selected: id === selected }}
            style={[styles.zone, id === selected && styles.selected]} onPress={() => onSelect(id)}>
            <Text style={styles.label}>{pickups[0].restaurant_name || 'Pickup zone'}</Text>
            <Text style={styles.label}>{pickups.length} open{closingSoon ? ` · ${closingSoon} closing soon` : ''}</Text>
          </Pressable>
        ))}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { padding: 14, borderRadius: 16, backgroundColor: Colors.cream, gap: 8 },
  title: { fontSize: 17, fontWeight: '700', color: Colors.dark },
  controls: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  zone: { minHeight: 44, padding: 8, borderWidth: 1, borderColor: Colors.greenLight, borderRadius: 10 },
  selected: { backgroundColor: Colors.greenLight, borderColor: Colors.green },
  label: { color: Colors.dark, fontSize: 13 },
});
