// Manage Restaurants — exec view of every restaurant partner.
// Lets the exec:
//   - filter by status (Pending / Approved / Rejected)
//   - tap a card to expand its full detail (contact, address,
//     food type, cadence, application timestamp, linked user id)
//   - edit any field inline (saves on tap-Save)
//   - approve a pending application (plain confirm)
//   - reject or deactivate an existing partner (password-gated)
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import Button from '../../components/ui/Button';
import ResponsiveContainer from '../../components/ui/ResponsiveContainer';
import Screen from '../../components/ui/Screen';
import { fetchRestaurants, updateRestaurant } from '../../services/database';
import { notify, confirm } from '../../services/ui';
import { confirmWithPassword } from '../../services/passwordConfirm';

const TABS = ['pending', 'approved', 'rejected'];

const EDITABLE_FIELDS = [
  { key: 'name',         label: 'Restaurant name' },
  { key: 'address',      label: 'Address' },
  { key: 'city',         label: 'City' },
  { key: 'state',        label: 'State' },
  { key: 'zip',          label: 'ZIP' },
  { key: 'contact_name', label: 'Contact person' },
  { key: 'email',        label: 'Contact email' },
  { key: 'phone',        label: 'Contact phone' },
  { key: 'food_type',    label: 'Type of food' },
  { key: 'frequency',    label: 'Expected donation frequency' },
  { key: 'notes',        label: 'Internal notes' },
];

function fmtDate(t) {
  if (!t) return '—';
  const d = t.toDate ? t.toDate() : new Date(t);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ManageRestaurants({ navigation }) {
  const [restaurants, setRestaurants] = useState([]);
  const [tab, setTab] = useState('pending');
  const [expanded, setExpanded] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchRestaurants(tab);
      setRestaurants(data);
    } catch (e) { console.warn(e); }
  }, [tab]);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handleAction(rest, action) {
    const ok = action === 'rejected'
      ? await confirmWithPassword(
          `Reject ${rest.name}?`,
          'They will see an "application not accepted" screen and lose access to the restaurant dashboard. You can re-approve later from the Rejected tab.',
          { confirmLabel: 'Reject', destructive: true }
        )
      : await confirm(`Approve ${rest.name}?`, "They'll see their dashboard unlock automatically within 8 seconds.");
    if (!ok) return;
    try {
      await updateRestaurant(rest.id, { status: action });
      load();
      notify(action === 'rejected' ? 'Rejected' : 'Approved', '');
    } catch (e) {
      notify('Could not save', e?.message || 'Try again.');
    }
  }

  function startEdit(rest) {
    const next = {};
    EDITABLE_FIELDS.forEach((f) => { next[f.key] = rest[f.key] || ''; });
    setForm(next);
    setEditingId(rest.id);
  }
  function cancelEdit() { setEditingId(null); setForm({}); }

  async function saveEdit(rest) {
    setSaving(true);
    try {
      // Only push fields that actually changed.
      const updates = {};
      EDITABLE_FIELDS.forEach((f) => {
        const next = (form[f.key] || '').trim();
        if (next !== (rest[f.key] || '')) updates[f.key] = next;
      });
      if (Object.keys(updates).length) {
        await updateRestaurant(rest.id, updates);
      }
      setEditingId(null);
      setForm({});
      load();
      notify('Saved', 'Restaurant updated.');
    } catch (e) {
      notify('Could not save', e?.message || 'Try again.');
    } finally { setSaving(false); }
  }

  return (
    <Screen contentStyle={styles.content}>
      <ResponsiveContainer maxWidth={960}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
        <BrushText variant="screenTitle" style={styles.title}>Manage Restaurants</BrushText>
        <Text style={styles.subtitle}>
          Approve applications, edit partner info, or revoke access.
        </Text>

        <View style={styles.tabs}>
          {TABS.map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.tab, tab === t && styles.tabActive]}
              onPress={() => { setTab(t); setExpanded(null); setEditingId(null); }}
            >
              <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {restaurants.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No {tab} restaurants.</Text>
          </View>
        ) : (
          restaurants.map((rest) => {
            const isOpen = expanded === rest.id;
            const isEditing = editingId === rest.id;
            return (
              <View key={rest.id} style={styles.card}>
                {/* Header — always visible */}
                <TouchableOpacity
                  onPress={() => { if (!isEditing) setExpanded(isOpen ? null : rest.id); }}
                  activeOpacity={0.85}
                  style={styles.cardHead}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{rest.name || '(unnamed)'}</Text>
                    <Text style={styles.sub}>
                      {[rest.city, rest.state].filter(Boolean).join(', ') || rest.address || '—'}
                    </Text>
                  </View>
                  <View style={[styles.statusPill, statusStyle(rest.status)]}>
                    <Text style={[styles.statusPillText, statusTextStyle(rest.status)]}>
                      {rest.status || 'pending'}
                    </Text>
                  </View>
                  <Text style={styles.chev}>{isOpen ? '▾' : '›'}</Text>
                </TouchableOpacity>

                {/* Expanded detail / edit */}
                {isOpen ? (
                  <View style={styles.expanded}>
                    {isEditing ? (
                      <>
                        {EDITABLE_FIELDS.map((f) => (
                          <View key={f.key} style={{ marginBottom: 10 }}>
                            <Text style={styles.label}>{f.label}</Text>
                            <TextInput
                              style={styles.input}
                              value={form[f.key]}
                              onChangeText={(v) => setForm((p) => ({ ...p, [f.key]: v }))}
                              placeholder={f.label}
                              autoCapitalize={f.key === 'email' || f.key === 'state' ? 'none' : 'sentences'}
                            />
                          </View>
                        ))}
                        <View style={styles.actionRow}>
                          <Button title="Cancel" variant="secondary" onPress={cancelEdit} style={{ flex: 1, marginRight: 6 }} />
                          <Button title="Save changes" onPress={() => saveEdit(rest)} loading={saving} style={{ flex: 1, marginLeft: 6 }} />
                        </View>
                      </>
                    ) : (
                      <>
                        <DetailRow label="Contact" value={rest.contact_name} />
                        <DetailRow label="Email"   value={rest.email} selectable />
                        <DetailRow label="Phone"   value={rest.phone} selectable />
                        <DetailRow label="Address" value={[rest.address, rest.city, rest.state, rest.zip].filter(Boolean).join(', ')} />
                        <DetailRow label="Food"    value={rest.food_type} />
                        <DetailRow label="Cadence" value={rest.frequency} />
                        {rest.notes ? <DetailRow label="Notes" value={rest.notes} /> : null}
                        <DetailRow label="Applied" value={fmtDate(rest.created_at)} />
                        {rest.user_id ? <DetailRow label="User id" value={rest.user_id} mono /> : null}

                        <View style={styles.actionRow}>
                          {tab === 'pending' ? (
                            <>
                              <Button title="Approve" onPress={() => handleAction(rest, 'approved')} style={{ flex: 1, marginRight: 6 }} />
                              <Button title="Reject"  variant="secondary" onPress={() => handleAction(rest, 'rejected')} style={{ flex: 1, marginLeft: 6 }} />
                            </>
                          ) : (
                            <Button title="Edit details" variant="secondary" onPress={() => startEdit(rest)} style={{ flex: 1, marginRight: 6 }} />
                          )}
                          {tab === 'approved' ? (
                            <Button title="Deactivate" onPress={() => handleAction(rest, 'rejected')} style={{ flex: 1, marginLeft: 6 }} />
                          ) : null}
                          {tab === 'rejected' ? (
                            <Button title="Re-approve" onPress={() => handleAction(rest, 'approved')} style={{ flex: 1, marginLeft: 6 }} />
                          ) : null}
                        </View>
                      </>
                    )}
                  </View>
                ) : null}
              </View>
            );
          })
        )}
      </ResponsiveContainer>
    </Screen>
  );
}

function DetailRow({ label, value, mono, selectable }) {
  if (!value) return null;
  return (
    <View style={styles.dRow}>
      <Text style={styles.dKey}>{label}</Text>
      <Text style={[styles.dVal, mono && styles.dValMono]} selectable={!!selectable}>{value}</Text>
    </View>
  );
}

function statusStyle(status) {
  if (status === 'approved') return { backgroundColor: '#E8F5EE' };
  if (status === 'rejected') return { backgroundColor: '#FFE4E6' };
  return { backgroundColor: '#FEF3C7' };
}
function statusTextStyle(status) {
  if (status === 'approved') return { color: Colors.green };
  if (status === 'rejected') return { color: Colors.pink };
  return { color: '#92400E' };
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream, ...(Platform.OS === 'web' ? { height: '100vh' } : null) },
  content: { padding: 24, paddingTop: 60, paddingBottom: 60 },
  back: { fontSize: 16, color: Colors.green, marginBottom: 8 },
  title: { color: Colors.green, marginBottom: 6 },
  subtitle: { ...Type.body, color: Colors.gray, marginBottom: 18 },
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 18 },
  tab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.glassBorder },
  tabActive: { backgroundColor: Colors.green, borderColor: Colors.green },
  tabText: { fontSize: 13, fontWeight: '700', color: Colors.gray },
  tabTextActive: { color: '#FFF' },
  empty: { padding: 40, alignItems: 'center' },
  emptyText: { ...Type.caption },
  card: { backgroundColor: Colors.white, borderRadius: Radius.xl, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: Colors.glassBorder, ...Shadows.card },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { fontSize: 16, fontWeight: '800', color: Colors.dark },
  sub: { ...Type.caption, marginTop: 2 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  statusPillText: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },
  chev: { fontSize: 22, color: Colors.grayMid },
  expanded: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: Colors.grayLight },
  dRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#F0EBD9' },
  dKey: { fontSize: 12, fontWeight: '700', color: Colors.grayMid, letterSpacing: 0.4, textTransform: 'uppercase' },
  dVal: { fontSize: 13, color: Colors.dark, textAlign: 'right', flexShrink: 1 },
  dValMono: { fontSize: 11, fontFamily: Platform.OS === 'web' ? 'monospace' : 'Courier' },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  label: { fontSize: 12, fontWeight: '700', color: Colors.gray, marginBottom: 4, letterSpacing: 0.4, textTransform: 'uppercase' },
  input: { borderWidth: 1, borderColor: Colors.glassBorder, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: Colors.dark, backgroundColor: '#FAF8F1' },
});
