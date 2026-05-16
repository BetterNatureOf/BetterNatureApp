// Fridge picker — list of community fridges in the user's chapter (or
// org-wide if none), tap to select. Shows distance when we have a
// reference point. Used by both the restaurant when posting surplus
// ("preferred fridge") and the volunteer when completing a drop-off.
import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { Colors, Type, Radius } from '../../config/theme';
import AnimatedPressable from './AnimatedPressable';
import Icon from './Icon';
import { listFridges, milesBetween } from '../../services/fridges';

export default function FridgePicker({
  value,            // selected fridge id
  onChange,         // (fridgeId, fridge) => void
  chapterId,        // narrow to one chapter; falls back to all if empty list
  origin,           // { lat, lng } to compute distance against (optional)
  emptyHint = 'No fridges set up yet. Ask your chapter lead to add one.',
}) {
  const [fridges, setFridges] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        let list = await listFridges({ chapterId });
        // Fallback: if the chapter has no fridges yet, show every active one.
        if (chapterId && list.length === 0) list = await listFridges();
        if (alive) setFridges(list);
      } catch {
        if (alive) setFridges([]);
      }
    })();
    return () => { alive = false; };
  }, [chapterId]);

  const sorted = useMemo(() => {
    if (!fridges) return null;
    if (!origin || origin.lat == null) return fridges;
    return [...fridges]
      .map((f) => ({ ...f, _miles: milesBetween(origin, f) }))
      .sort((a, b) => (a._miles ?? 99999) - (b._miles ?? 99999));
  }, [fridges, origin]);

  if (!sorted) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="small" color={Colors.green} />
      </View>
    );
  }

  if (sorted.length === 0) {
    return (
      <View style={styles.empty}>
        <Icon name="info" size={18} color={Colors.gray} />
        <Text style={styles.emptyText}>{emptyHint}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={{ maxHeight: 320 }}>
      <View style={{ gap: 10 }}>
        {sorted.map((f) => {
          const selected = f.id === value;
          return (
            <AnimatedPressable
              key={f.id}
              style={[styles.row, selected && styles.rowOn]}
              scaleTo={0.985}
              onPress={() => onChange?.(f.id, f)}
            >
              <View style={[styles.iconWrap, selected && styles.iconWrapOn]}>
                <Icon name="pin" size={18} color={selected ? Colors.white : Colors.green} />
              </View>
              <View style={styles.body}>
                <Text style={[styles.name, selected && styles.nameOn]}>{f.name}</Text>
                <Text style={[styles.meta, selected && styles.metaOn]} numberOfLines={1}>
                  {f.address || `${f.city || ''}${f.state ? ', ' + f.state : ''}`}
                </Text>
                <View style={styles.tagRow}>
                  {f.hours ? (
                    <Text style={[styles.tag, selected && styles.tagOn]}>{f.hours}</Text>
                  ) : null}
                  {f.capacity ? (
                    <Text style={[styles.tag, selected && styles.tagOn]}>{capacityLabel(f.capacity)}</Text>
                  ) : null}
                  {f._miles != null ? (
                    <Text style={[styles.tag, selected && styles.tagOn]}>{f._miles.toFixed(1)} mi</Text>
                  ) : null}
                </View>
              </View>
              {selected ? <Icon name="check" size={20} color={Colors.white} /> : null}
            </AnimatedPressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

function capacityLabel(c) {
  if (c === 'low') return 'Light load';
  if (c === 'high') return 'Lots of room';
  return 'Medium';
}

const styles = StyleSheet.create({
  loading: { padding: 24, alignItems: 'center' },
  empty: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 14,
    backgroundColor: Colors.greenLight,
    borderRadius: Radius.lg,
  },
  emptyText: { ...Type.caption, color: Colors.gray, flex: 1 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14,
    borderRadius: Radius.lg,
    backgroundColor: Colors.white,
    borderWidth: 1.5,
    borderColor: Colors.glassBorder,
  },
  rowOn: { backgroundColor: Colors.green, borderColor: Colors.green },
  iconWrap: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: Colors.greenLight,
    alignItems: 'center', justifyContent: 'center',
  },
  iconWrapOn: { backgroundColor: 'rgba(255,255,255,0.18)' },
  body: { flex: 1 },
  name: { fontSize: 15, fontWeight: '700', color: Colors.dark },
  nameOn: { color: Colors.white },
  meta: { ...Type.caption, color: Colors.gray, marginTop: 2 },
  metaOn: { color: 'rgba(255,255,255,0.85)' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  tag: {
    fontSize: 11, fontWeight: '600',
    color: Colors.green,
    backgroundColor: Colors.greenLight,
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 8,
  },
  tagOn: { color: Colors.white, backgroundColor: 'rgba(255,255,255,0.18)' },
});
