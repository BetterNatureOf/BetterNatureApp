// Cross-platform date picker.
//   - Web: renders a native <input type="date"> (and "datetime-local" if
//     `mode="datetime"`). Browsers give us a real calendar UI for free.
//   - Native: tiny inline scroller fallback so we don't add a new
//     native dependency. Good enough for now; swap for
//     @react-native-community/datetimepicker once it's installed.
//
// Value is always a JS Date (or null). onChange receives a Date.
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, Platform } from 'react-native';
import { Colors, Type, Radius } from '../../config/theme';

function pad(n) { return String(n).padStart(2, '0'); }
function toLocalIso(d, withTime) {
  if (!d) return '';
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  if (!withTime) return date;
  return `${date}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function DatePicker({ value, onChange, mode = 'date', placeholder = 'Pick a date', minDate, style }) {
  const [open, setOpen] = useState(false);

  // Web: hand the browser a real calendar widget.
  if (Platform.OS === 'web') {
    const type = mode === 'datetime' ? 'datetime-local' : 'date';
    const min = minDate ? toLocalIso(minDate, mode === 'datetime') : undefined;
    return (
      <View style={[styles.webWrap, style]}>
        {React.createElement('input', {
          type,
          value: toLocalIso(value, mode === 'datetime'),
          min,
          onChange: (e) => {
            const v = e.target.value;
            onChange?.(v ? new Date(v) : null);
          },
          style: webInputStyle,
        })}
      </View>
    );
  }

  // Native fallback — tap to open a small year/month/day scroller.
  const display = value ? value.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  }) : placeholder;

  return (
    <>
      <TouchableOpacity style={[styles.field, style]} onPress={() => setOpen(true)} activeOpacity={0.8}>
        <Text style={[styles.fieldText, !value && styles.placeholder]}>{display}</Text>
        <Text style={styles.icon}>📅</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.modalScrim}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Pick a date</Text>
            <SimpleDateScroller value={value || new Date()} minDate={minDate} onChange={(d) => onChange?.(d)} />
            <View style={styles.modalRow}>
              <TouchableOpacity onPress={() => setOpen(false)} style={styles.modalBtn}>
                <Text style={styles.modalBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

function SimpleDateScroller({ value, minDate, onChange }) {
  const today = minDate || new Date();
  const days = [];
  for (let i = 0; i < 60; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    days.push(d);
  }
  const selectedKey = toLocalIso(value);
  return (
    <ScrollView style={styles.scroller}>
      {days.map((d) => {
        const key = toLocalIso(d);
        const on = key === selectedKey;
        return (
          <TouchableOpacity
            key={key}
            style={[styles.dayRow, on && styles.dayRowOn]}
            onPress={() => onChange(d)}
          >
            <Text style={[styles.dayText, on && styles.dayTextOn]}>
              {d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const webInputStyle = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 14,
  border: `1.5px solid ${Colors.glassBorder}`,
  background: Colors.white,
  fontSize: 15,
  color: Colors.dark,
  fontFamily: 'inherit',
  outline: 'none',
};

const styles = StyleSheet.create({
  webWrap: { width: '100%' },
  field: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1.5, borderColor: Colors.glassBorder,
    paddingVertical: 14, paddingHorizontal: 14,
  },
  fieldText: { ...Type.body, color: Colors.dark },
  placeholder: { color: Colors.gray },
  icon: { fontSize: 18 },
  modalScrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: Colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '70%' },
  modalTitle: { fontSize: 17, fontWeight: '700', color: Colors.dark, textAlign: 'center', marginBottom: 12 },
  scroller: { maxHeight: 320 },
  dayRow: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: 10 },
  dayRowOn: { backgroundColor: Colors.green },
  dayText: { fontSize: 15, color: Colors.dark },
  dayTextOn: { color: Colors.white, fontWeight: '700' },
  modalRow: { marginTop: 12, alignItems: 'center' },
  modalBtn: { backgroundColor: Colors.green, paddingVertical: 12, paddingHorizontal: 32, borderRadius: 12 },
  modalBtnText: { color: Colors.white, fontWeight: '700' },
});
