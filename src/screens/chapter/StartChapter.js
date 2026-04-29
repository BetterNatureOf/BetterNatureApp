import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { Colors, Type } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { createChapter } from '../../services/database';

export default function StartChapter({ navigation, route }) {
  const userData = route?.params;
  const [name, setName] = useState('');
  const [city, setCity] = useState(userData?.city || '');
  const [state, setState] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleCreate() {
    if (!name.trim() || !city.trim() || !state.trim()) {
      Alert.alert('Required', 'Please fill in chapter name, city, and state.');
      return;
    }

    setLoading(true);
    try {
      await createChapter({
        name: name.trim(),
        city: city.trim(),
        state: state.trim(),
        access_code: accessCode || null,
        status: 'pending',
      });
      Alert.alert(
        'Chapter Submitted!',
        'Your chapter application is under review. We\'ll notify you once approved.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to create chapter');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <BrushText variant="screenTitle" style={styles.title}>
          Start a Chapter
        </BrushText>
        <Text style={styles.subtitle}>
          Bring BetterNature to your community. Start a local chapter and make an impact.
        </Text>

        <Input label="Chapter Name" placeholder="e.g., BetterNature Austin" value={name} onChangeText={setName} />
        <View style={styles.row}>
          <Input label="City" placeholder="City" value={city} onChangeText={setCity} containerStyle={styles.half} />
          <Input label="State" placeholder="State" value={state} onChangeText={setState} containerStyle={styles.half} />
        </View>
        <Input
          label="Access Code (optional)"
          placeholder="Create a code for your team"
          value={accessCode}
          onChangeText={setAccessCode}
        />

        <Text style={styles.note}>
          Your chapter will be reviewed by the BetterNature executive team before going live.
          You'll be notified within 48 hours.
        </Text>

        <Button title="Submit Chapter Application" onPress={handleCreate} loading={loading} style={styles.btn} />
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
  note: { ...Type.caption, marginTop: 8, marginBottom: 16, lineHeight: 18 },
  btn: { marginTop: 8 },
});
