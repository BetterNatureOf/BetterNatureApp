// ID verification screen — restaurants/volunteers must upload a government
// ID before they can post or claim pickups. Food handed to a stranger needs
// a real name on both ends; this is the cheapest way to get one.
import React, { useState } from 'react';
import { View, Text, ScrollView, Image, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Colors, Type, Radius } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import Button from '../../components/ui/Button';
import useAuthStore from '../../store/authStore';
import Icon from '../../components/ui/Icon';
import { uploadIdDocument, getProfile } from '../../services/auth';

export default function VerifyIdScreen({ navigation }) {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [uri, setUri] = useState(null);
  const [busy, setBusy] = useState(false);

  async function pick() {
    const res = await ImagePicker.launchImageLibraryAsync({
      quality: 0.7,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
    });
    if (!res.canceled) setUri(res.assets[0].uri);
  }

  async function snap() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return pick();
    const res = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!res.canceled) setUri(res.assets[0].uri);
  }

  async function submit() {
    if (!uri) return Alert.alert('Pick a photo', 'Snap or upload a photo of your ID first.');
    if (!user?.id) return;
    setBusy(true);
    try {
      await uploadIdDocument(user.id, uri);
      const fresh = await getProfile(user.id);
      if (fresh && setUser) setUser(fresh);
      Alert.alert('Verified', 'Thanks — you can now schedule and claim pickups.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      Alert.alert('Upload failed', e.message || 'Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Text style={styles.back}>‹ Back</Text>
      </TouchableOpacity>
      <BrushText variant="screenTitle" style={styles.title}>Verify your ID</BrushText>
      <Text style={styles.subtitle}>
        We need a photo of a government-issued ID before you can schedule or claim
        food pickups. Your ID is stored privately and only used for verification.
      </Text>

      <TouchableOpacity style={styles.well} onPress={snap} activeOpacity={0.85}>
        {uri ? (
          <Image source={{ uri }} style={styles.preview} />
        ) : (
          <>
            <Icon name="id-card" size={56} color={Colors.green} strokeWidth={1.5} />
            <Text style={[styles.wellCta, { marginTop: 12 }]}>Tap to take photo</Text>
            <Text style={styles.wellHelp}>Driver's license, passport, or state ID</Text>
          </>
        )}
      </TouchableOpacity>

      <TouchableOpacity onPress={pick} style={styles.altBtn}>
        <Text style={styles.altText}>Or choose from library</Text>
      </TouchableOpacity>

      <Button
        title={busy ? 'Uploading…' : 'Submit ID'}
        onPress={submit}
        loading={busy}
        style={{ marginTop: 24 }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  content: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  back: { fontSize: 16, color: Colors.green, marginBottom: 8 },
  title: { color: Colors.green },
  subtitle: { ...Type.body, color: Colors.gray, marginTop: 6, marginBottom: 20 },
  well: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: Radius.xl,
    backgroundColor: Colors.greenLight,
    borderWidth: 2,
    borderColor: Colors.green + '40',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  preview: { width: '100%', height: '100%' },
  wellEmoji: { fontSize: 56, marginBottom: 12 },
  wellCta: { fontSize: 17, fontWeight: '700', color: Colors.green },
  wellHelp: { ...Type.caption, color: Colors.gray, marginTop: 4 },
  altBtn: { alignSelf: 'center', padding: 12 },
  altText: { color: Colors.pink, fontWeight: '600' },
});
