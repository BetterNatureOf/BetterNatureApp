import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import useAuthStore from '../../store/authStore';
import { createAnnouncement } from '../../services/database';

const TARGETS = [
  { key: 'all', label: 'Everyone' },
  { key: 'restaurants', label: 'All Restaurants' },
];

export default function BroadcastScreen({ navigation }) {
  const user = useAuthStore((s) => s.user);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [target, setTarget] = useState('all');
  const [loading, setLoading] = useState(false);

  async function handleSend() {
    if (!title.trim() || !message.trim()) {
      Alert.alert('Required', 'Please enter a title and message.');
      return;
    }

    setLoading(true);
    try {
      await createAnnouncement({
        title,
        message,
        target,
        sent_by: user?.id,
      });
      Alert.alert('Sent!', 'Broadcast sent successfully.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.back} onPress={() => navigation.goBack()}>‹ Back</Text>
      <BrushText variant="screenTitle" style={styles.title}>
        Broadcast
      </BrushText>
      <Text style={styles.subtitle}>Send an announcement to the community</Text>

      <Text style={styles.label}>Send To</Text>
      <View style={styles.targetRow}>
        {TARGETS.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.targetBtn, target === t.key && styles.targetActive]}
            onPress={() => setTarget(t.key)}
          >
            <Text style={[styles.targetText, target === t.key && styles.targetTextActive]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Input label="Title" placeholder="Announcement title" value={title} onChangeText={setTitle} />
      <Input
        label="Message"
        placeholder="Write your message..."
        value={message}
        onChangeText={setMessage}
        multiline
        style={{ height: 120, textAlignVertical: 'top' }}
      />

      <Button title="Send Broadcast" onPress={handleSend} loading={loading} style={styles.btn} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  content: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  back: { fontSize: 16, color: Colors.green, marginBottom: 8 },
  title: { color: Colors.green },
  subtitle: { ...Type.body, color: Colors.gray, marginTop: 4, marginBottom: 24 },
  label: { fontSize: 15, fontWeight: '500', color: Colors.dark, marginBottom: 8 },
  targetRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  targetBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.grayLight,
  },
  targetActive: { backgroundColor: Colors.green, borderColor: Colors.green },
  targetText: { fontSize: 13, fontWeight: '600', color: Colors.gray },
  targetTextActive: { color: Colors.white },
  btn: { marginTop: 8 },
});
