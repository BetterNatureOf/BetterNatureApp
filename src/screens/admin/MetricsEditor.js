import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  Alert,
  Platform,
} from 'react-native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import Button from '../../components/ui/Button';
import ResponsiveContainer from '../../components/ui/ResponsiveContainer';
import useBreakpoint from '../../hooks/useBreakpoint';
import useAuthStore, { ROLES } from '../../store/authStore';
import {
  fetchOrgMetrics,
  updateOrgMetric,
  createOrgMetric,
} from '../../services/database';

// Shared editor used by both executive ("org" mode, all metrics) and chapter
// president ("chapter" mode, only their chapter). Tap a row to adjust its
// value. Computed metrics show the auto-tracked base + the manual offset so
// editors understand exactly what they're tweaking.
export default function MetricsEditor({ navigation, route }) {
  const user = useAuthStore((s) => s.user);
  const role = useAuthStore((s) => s.role);
  const { isWide } = useBreakpoint();

  const mode =
    route?.params?.mode || (role === ROLES.PRESIDENT ? 'chapter' : 'org');
  const chapterId =
    mode === 'chapter' ? user?.chapter_id || 'ch-memphis' : null;

  const [metrics, setMetrics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // metric being edited
  const [draftValue, setDraftValue] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newUnit, setNewUnit] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchOrgMetrics({ scope: mode, chapterId });
      setMetrics(rows);
    } catch (e) {}
    setLoading(false);
  }, [mode, chapterId]);

  useEffect(() => {
    load();
  }, [load]);

  function openEdit(metric) {
    setEditing(metric);
    // For computed metrics we edit the manual offset; for manual metrics we
    // edit the displayed value (which is itself just the offset under the hood).
    setDraftValue(String(metric.adjustment ?? 0));
  }

  async function saveEdit() {
    if (!editing) return;
    const num = Number(draftValue);
    if (Number.isNaN(num)) {
      Alert.alert('Invalid number', 'Please enter a numeric value.');
      return;
    }
    try {
      await updateOrgMetric(editing.id, {
        adjustment: num,
        updated_by: user?.name || 'Admin',
      });
      setEditing(null);
      load();
    } catch (e) {
      Alert.alert('Save failed', e?.message || 'Could not update metric.');
    }
  }

  async function saveNew() {
    if (!newLabel.trim()) {
      Alert.alert('Missing label', 'Give the metric a name.');
      return;
    }
    const num = Number(newValue) || 0;
    try {
      await createOrgMetric({
        key: newLabel.toLowerCase().replace(/\s+/g, '_'),
        label: newLabel.trim(),
        scope: mode,
        chapter_id: chapterId,
        unit: newUnit.trim() || null,
        project: null,
        computed: false,
        source: null,
        adjustment: num,
        updated_by: user?.name || 'Admin',
      });
      setShowAdd(false);
      setNewLabel('');
      setNewValue('');
      setNewUnit('');
      load();
    } catch (e) {
      Alert.alert('Add failed', e?.message || 'Could not create metric.');
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ResponsiveContainer maxWidth={900}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
        <BrushText variant="screenTitle" style={styles.title}>
          {mode === 'chapter' ? 'Chapter Metrics' : 'Impact Metrics'}
        </BrushText>
        <Text style={styles.subtitle}>
          {mode === 'chapter'
            ? 'Numbers shown on your chapter dashboards. Auto-tracked metrics update as your team logs pickups and events — adjust the offset to correct or supplement them.'
            : 'Numbers shown across the org. Auto-tracked from pickups and events; tweak the offset or add new manual metrics like trees planted or hygiene kits.'}
        </Text>

        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: Colors.sage }]} />
            <Text style={styles.legendText}>Auto-tracked</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: Colors.pink }]} />
            <Text style={styles.legendText}>Manual</Text>
          </View>
        </View>

        {loading && <Text style={styles.loading}>Loading…</Text>}

        <View style={[styles.list, isWide && styles.listWide]}>
          {metrics.map((m) => (
            <TouchableOpacity
              key={m.id}
              style={[styles.row, isWide && styles.rowWide]}
              activeOpacity={0.85}
              onPress={() => openEdit(m)}
            >
              <View style={styles.rowHeader}>
                <View
                  style={[
                    styles.tag,
                    {
                      backgroundColor: m.computed
                        ? Colors.sage
                        : Colors.pink,
                    },
                  ]}
                >
                  <Text style={styles.tagText}>
                    {m.computed ? 'AUTO' : 'MANUAL'}
                  </Text>
                </View>
                <Text style={styles.editHint}>Tap to edit</Text>
              </View>
              <Text style={styles.label}>{m.label}</Text>
              <Text style={styles.value}>
                {Number(m.value).toLocaleString()}{' '}
                <Text style={styles.unit}>{m.unit || ''}</Text>
              </Text>
              {m.computed && (
                <Text style={styles.breakdown}>
                  Base {m.base.toLocaleString()} + adjustment{' '}
                  {(m.adjustment >= 0 ? '+' : '')}
                  {m.adjustment.toLocaleString()}
                </Text>
              )}
              <Text style={styles.meta}>
                Last updated by {m.updated_by} ·{' '}
                {new Date(m.updated_at).toLocaleDateString()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={styles.addCard}
          activeOpacity={0.85}
          onPress={() => setShowAdd(true)}
        >
          <Text style={styles.addPlus}>＋</Text>
          <Text style={styles.addLabel}>Add a manual metric</Text>
          <Text style={styles.addDesc}>
            For things the app can't auto-track yet (trees planted, kits
            donated, water sites tested, etc.)
          </Text>
        </TouchableOpacity>
      </ResponsiveContainer>

      {/* Edit modal */}
      <Modal
        visible={!!editing}
        transparent
        animationType="fade"
        onRequestClose={() => setEditing(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{editing?.label}</Text>
            {editing?.computed ? (
              <Text style={styles.modalHint}>
                Auto base: {editing.base.toLocaleString()}. Adjust the offset
                below to correct or supplement the auto count.
              </Text>
            ) : (
              <Text style={styles.modalHint}>
                Enter the current total for this metric.
              </Text>
            )}
            <TextInput
              style={styles.input}
              value={draftValue}
              onChangeText={setDraftValue}
              keyboardType={
                Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'numeric'
              }
              autoFocus
              selectTextOnFocus
            />
            {editing?.computed && (
              <Text style={styles.preview}>
                New displayed value:{' '}
                {(
                  (editing.base || 0) + (Number(draftValue) || 0)
                ).toLocaleString()}{' '}
                {editing.unit}
              </Text>
            )}
            <View style={styles.modalRow}>
              <Button
                title="Cancel"
                variant="secondary"
                onPress={() => setEditing(null)}
                style={{ flex: 1, marginRight: 8 }}
              />
              <Button
                title="Save"
                onPress={saveEdit}
                style={{ flex: 1, marginLeft: 8 }}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Add modal */}
      <Modal
        visible={showAdd}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAdd(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>New manual metric</Text>
            <Text style={styles.fieldLabel}>Label</Text>
            <TextInput
              style={styles.input}
              value={newLabel}
              onChangeText={setNewLabel}
              placeholder="e.g. Trees Planted"
              placeholderTextColor={Colors.grayMid}
            />
            <Text style={styles.fieldLabel}>Current value</Text>
            <TextInput
              style={styles.input}
              value={newValue}
              onChangeText={setNewValue}
              placeholder="0"
              placeholderTextColor={Colors.grayMid}
              keyboardType="numeric"
            />
            <Text style={styles.fieldLabel}>Unit (optional)</Text>
            <TextInput
              style={styles.input}
              value={newUnit}
              onChangeText={setNewUnit}
              placeholder="e.g. trees, kits, sites"
              placeholderTextColor={Colors.grayMid}
            />
            <View style={styles.modalRow}>
              <Button
                title="Cancel"
                variant="secondary"
                onPress={() => setShowAdd(false)}
                style={{ flex: 1, marginRight: 8 }}
              />
              <Button
                title="Add"
                onPress={saveNew}
                style={{ flex: 1, marginLeft: 8 }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
    ...(Platform.OS === 'web' ? { height: '100vh' } : null),
  },
  content: { padding: 24, paddingTop: 60, paddingBottom: 80 },
  back: { fontSize: 16, color: Colors.green, marginBottom: 8 },
  title: { color: Colors.green },
  subtitle: { ...Type.body, color: Colors.gray, marginTop: 6, marginBottom: 16 },
  legend: { flexDirection: 'row', gap: 16, marginBottom: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 12, color: Colors.gray },
  loading: { color: Colors.gray, marginVertical: 12 },
  list: { flexDirection: 'column', gap: 12 },
  listWide: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  row: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: 18,
    ...Shadows.card,
  },
  rowWide: { flexBasis: '47%', flexGrow: 1, minWidth: 260 },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  tagText: {
    color: Colors.white,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  editHint: { fontSize: 11, color: Colors.grayMid },
  label: { fontSize: 14, fontWeight: '600', color: Colors.dark },
  value: {
    fontSize: 28,
    fontFamily: 'Caveat-Bold',
    color: Colors.green,
    marginTop: 4,
  },
  unit: { fontSize: 14, color: Colors.gray, fontFamily: undefined },
  breakdown: { fontSize: 11, color: Colors.gray, marginTop: 2 },
  meta: { fontSize: 11, color: Colors.grayMid, marginTop: 8 },
  addCard: {
    marginTop: 16,
    backgroundColor: 'transparent',
    borderRadius: Radius.lg,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: Colors.sage,
    padding: 24,
    alignItems: 'center',
  },
  addPlus: { fontSize: 36, color: Colors.sage, fontWeight: '300' },
  addLabel: { fontSize: 15, fontWeight: '700', color: Colors.green, marginTop: 4 },
  addDesc: { ...Type.caption, textAlign: 'center', marginTop: 4 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: 24,
    ...Shadows.card,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: Colors.green },
  modalHint: { ...Type.caption, marginTop: 6, marginBottom: 12 },
  fieldLabel: {
    fontSize: 12,
    color: Colors.gray,
    marginTop: 8,
    marginBottom: 4,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.grayMid,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: Colors.dark,
    backgroundColor: Colors.cream,
  },
  preview: { ...Type.caption, marginTop: 10, color: Colors.green, fontWeight: '600' },
  modalRow: { flexDirection: 'row', marginTop: 18 },
});
