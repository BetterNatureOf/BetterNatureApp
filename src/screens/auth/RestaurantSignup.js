import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Colors, Type } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { createRestaurant } from '../../services/database';
import useAuthStore, { ROLES } from '../../store/authStore';

export default function RestaurantSignup({ navigation }) {
  const setUser = useAuthStore((s) => s.setUser);
  const [form, setForm] = useState({
    name: '',
    address: '',
    contact_name: '',
    email: '',
    phone: '',
    food_type: '',
    frequency: '',
  });
  const [loading, setLoading] = useState(false);

  function update(key, val) {
    setForm((prev) => ({ ...prev, [key]: val }));
  }

  async function handleSubmit() {
    if (!form.name.trim() || !form.email.trim()) {
      Alert.alert('Required', 'Please fill in the restaurant name and email.');
      return;
    }

    setLoading(true);
    try {
      const created = await createRestaurant(form);
      Alert.alert(
        'Welcome to BetterNature!',
        'Your restaurant is signed up. Opening your dashboard…',
        [
          {
            text: 'Continue',
            onPress: () =>
              setUser({
                id: created?.id || `mock-restaurant-${Date.now()}`,
                name: form.name,
                email: form.email,
                phone: form.phone,
                role: ROLES.RESTAURANT,
              }),
          },
        ]
      );
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to submit');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <BrushText variant="screenTitle" style={styles.title}>
          Restaurant Partner Signup
        </BrushText>
        <Text style={styles.subtitle}>
          Join BetterNature's food rescue network and help reduce waste in your community.
        </Text>

        <Input
          label="Restaurant Name"
          placeholder="Your restaurant"
          value={form.name}
          onChangeText={(v) => update('name', v)}
        />
        <Input
          label="Address"
          placeholder="123 Main St, City, State"
          value={form.address}
          onChangeText={(v) => update('address', v)}
        />
        <Input
          label="Contact Person"
          placeholder="Manager name"
          value={form.contact_name}
          onChangeText={(v) => update('contact_name', v)}
        />
        <Input
          label="Email"
          placeholder="restaurant@email.com"
          value={form.email}
          onChangeText={(v) => update('email', v)}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <Input
          label="Phone"
          placeholder="(555) 123-4567"
          value={form.phone}
          onChangeText={(v) => update('phone', v)}
          keyboardType="phone-pad"
        />
        <Input
          label="Type of Food"
          placeholder="e.g., Italian, bakery, mixed"
          value={form.food_type}
          onChangeText={(v) => update('food_type', v)}
        />
        <Input
          label="Expected Donation Frequency"
          placeholder="e.g., Daily, 3x/week, Weekly"
          value={form.frequency}
          onChangeText={(v) => update('frequency', v)}
        />

        <Button
          title="Submit Application"
          onPress={handleSubmit}
          loading={loading}
          style={styles.btn}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: Colors.cream },
  content: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  title: { color: Colors.green },
  subtitle: { ...Type.body, color: Colors.gray, marginTop: 4, marginBottom: 24 },
  btn: { marginTop: 8 },
});
