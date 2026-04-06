import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import Button from '../../components/ui/Button';
import { fetchRestaurants, updateRestaurant } from '../../services/database';

export default function ManageRestaurants({ navigation }) {
  const [restaurants, setRestaurants] = useState([]);
  const [tab, setTab] = useState('pending');

  useEffect(() => {
    load();
  }, [tab]);

  async function load() {
    try {
      const data = await fetchRestaurants(tab);
      setRestaurants(data);
    } catch (e) {
      console.error(e);
    }
  }

  async function handleAction(rest, action) {
    Alert.alert(
      `${action === 'approved' ? 'Approve' : 'Reject'} ${rest.name}?`,
      '',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            await updateRestaurant(rest.id, { status: action });
            load();
          },
        },
      ]
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Text style={styles.back}>‹ Back</Text>
      </TouchableOpacity>
      <BrushText variant="screenTitle" style={styles.title}>
        Manage Restaurants
      </BrushText>

      <View style={styles.tabs}>
        {['pending', 'approved', 'rejected'].map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, tab === t && styles.tabActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {restaurants.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No {tab} restaurants</Text>
        </View>
      ) : (
        restaurants.map((rest) => (
          <View key={rest.id} style={styles.card}>
            <Text style={styles.name}>{rest.name}</Text>
            <Text style={styles.detail}>{rest.address}</Text>
            <Text style={styles.detail}>{rest.contact_name} · {rest.email}</Text>
            <Text style={styles.detail}>Food: {rest.food_type} · Freq: {rest.frequency}</Text>
            {tab === 'pending' && (
              <View style={styles.actions}>
                <Button title="Approve" variant="small" onPress={() => handleAction(rest, 'approved')} style={styles.approveBtn} />
                <Button title="Reject" variant="secondary" onPress={() => handleAction(rest, 'rejected')} style={styles.rejectBtn} />
              </View>
            )}
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  content: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  back: { fontSize: 16, color: Colors.green, marginBottom: 8 },
  title: { color: Colors.green, marginBottom: 16 },
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.grayLight,
  },
  tabActive: { backgroundColor: Colors.green, borderColor: Colors.green },
  tabText: { fontSize: 13, fontWeight: '600', color: Colors.gray },
  tabTextActive: { color: Colors.white },
  empty: { padding: 40, alignItems: 'center' },
  emptyText: { ...Type.caption },
  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: 16,
    marginBottom: 12,
    ...Shadows.card,
  },
  name: { fontSize: 16, fontWeight: '700', color: Colors.dark },
  detail: { ...Type.caption, marginTop: 3 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  approveBtn: { flex: 1, height: 36 },
  rejectBtn: { flex: 1, height: 36, borderRadius: 18 },
});
