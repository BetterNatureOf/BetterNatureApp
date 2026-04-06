import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';

export default function ScheduleDonation({ navigation }) {
  const [form, setForm] = useState({
    items: '',
    quantity: '',
    date: '',
    time: '',
    instructions: '',
  });
  const [photoUri, setPhotoUri] = useState(null);
  const [loading, setLoading] = useState(false);

  function update(key, val) {
    setForm((prev) => ({ ...prev, [key]: val }));
  }

  async function pickPhoto() {
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.7,
      allowsEditing: true,
    });
    if (!result.canceled) {
      setPhotoUri(result.assets[0].uri);
    }
  }

  async function handleSubmit() {
    if (!form.items.trim() || !form.date.trim()) {
      Alert.alert('Required', 'Please enter the items and date.');
      return;
    }

    setLoading(true);
    try {
      // Would create pickup via database service
      Alert.alert(
        'Donation Scheduled!',
        'Volunteers in your area have been notified.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <BrushText variant="screenTitle" style={styles.title}>
          Schedule Donation
        </BrushText>
        <Text style={styles.subtitle}>
          Let volunteers know what food is available for rescue.
        </Text>

        <Input label="Food Items" placeholder="e.g., 20 sandwiches, 5 pizzas" value={form.items} onChangeText={(v) => update('items', v)} />
        <Input label="Quantity" placeholder="e.g., Enough for ~30 people" value={form.quantity} onChangeText={(v) => update('quantity', v)} />
        <View style={styles.row}>
          <Input label="Date" placeholder="MM/DD/YYYY" value={form.date} onChangeText={(v) => update('date', v)} containerStyle={styles.half} />
          <Input label="Time" placeholder="e.g., 5:00 PM" value={form.time} onChangeText={(v) => update('time', v)} containerStyle={styles.half} />
        </View>
        <Input
          label="Pickup Instructions"
          placeholder="e.g., Come to back door, ask for manager"
          value={form.instructions}
          onChangeText={(v) => update('instructions', v)}
          multiline
          style={{ height: 80 }}
        />

        {/* Photo */}
        <Text style={styles.photoLabel}>Photo of Food (optional)</Text>
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={styles.photoPreview} />
        ) : null}
        <Button title="Take Photo" variant="secondary" onPress={pickPhoto} style={styles.photoBtn} />

        <Button title="Schedule Pickup" onPress={handleSubmit} loading={loading} style={styles.submitBtn} />
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
  row: { flexDirection: 'row', gap: 12 },
  half: { flex: 1 },
  photoLabel: { fontSize: 15, fontWeight: '500', color: Colors.dark, marginBottom: 8 },
  photoPreview: { width: '100%', height: 200, borderRadius: Radius.lg, marginBottom: 12 },
  photoBtn: { marginBottom: 8 },
  submitBtn: { marginTop: 16 },
});
