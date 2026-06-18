// Final signup step — collects ID photos (front + back) and creates
// the auth account. Front + back uploads match the live shape
// `uploadIdDocument(uid, { frontUri, backUri })` in
// services/authFirebase.js — previously SignupStep3 passed a single
// URI and silently swallowed the destructuring error, which is why
// every recent signup had no ID on file.
import React, { useState } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Alert, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import Button from '../../components/ui/Button';
import ResponsiveContainer from '../../components/ui/ResponsiveContainer';
import { signUp, uploadIdDocument } from '../../services/auth';
import useAuthStore from '../../store/authStore';
import Screen from '../../components/ui/Screen';

export default function SignupStep3({ route }) {
  const userData = route.params;
  const [frontUri, setFrontUri] = useState(null);
  const [backUri, setBackUri]   = useState(null);
  const [loading, setLoading] = useState(false);
  const { setUser } = useAuthStore();

  async function pickFor(setter) {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'We need camera roll access to verify your ID.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsEditing: true,
    });
    if (!result.canceled) setter(result.assets[0].uri);
  }

  async function takeFor(setter) {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'We need camera access to take a photo of your ID.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.7,
      allowsEditing: true,
    });
    if (!result.canceled) setter(result.assets[0].uri);
  }

  async function handleSubmit(skipUpload = false) {
    setLoading(true);
    try {
      const authData = await signUp({
        email: userData.email,
        password: userData.password,
        name: userData.name,
        phone: userData.phone,
        city: userData.city,
        state: userData.state,
        country: userData.country,
        zip: userData.zip,
      });

      // Upload is best-effort — never block account creation. If
      // either side is missing we skip (the user can re-upload from
      // Settings → Verify ID later). The legacy signature mismatch
      // here used to drop every ID silently; now we pass the named
      // arg shape uploadIdDocument actually expects.
      if (!skipUpload && frontUri && backUri && authData.user) {
        try {
          await uploadIdDocument(authData.user.id, { frontUri, backUri });
        } catch (upErr) {
          console.warn('ID upload failed during signup:', upErr);
        }
      }

      if (authData?.user) setUser(authData.user);
    } catch (e) {
      console.error('Sign up failed:', e);
      const msg = e?.message || 'Something went wrong';
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert(`Sign Up Failed\n\n${msg}`);
      } else {
        Alert.alert('Sign Up Failed', msg);
      }
    } finally {
      setLoading(false);
    }
  }

  function SideUpload({ label, uri, setter, sideKey }) {
    return (
      <View style={styles.sideBlock}>
        <Text style={styles.sideLabel}>{label}</Text>
        <View style={styles.uploadArea}>
          {uri ? (
            <Image source={{ uri }} style={styles.preview} />
          ) : (
            <View style={styles.placeholder}>
              <Text style={styles.placeholderIcon}>📄</Text>
              <Text style={styles.placeholderText}>Tap below to add</Text>
            </View>
          )}
        </View>
        <View style={styles.buttonRow}>
          <TouchableOpacity onPress={() => pickFor(setter)} style={styles.smallBtn} activeOpacity={0.85}>
            <Text style={styles.smallBtnText}>Choose</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => takeFor(setter)} style={styles.smallBtn} activeOpacity={0.85}>
            <Text style={styles.smallBtnText}>Camera</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const hasBothSides = !!(frontUri && backUri);

  return (
    <Screen contentStyle={styles.content}>
     <ResponsiveContainer maxWidth={620}>
      <BrushText variant="screenTitle" style={styles.title}>
        Verify Your Identity
      </BrushText>
      <Text style={styles.subtitle}>
        Upload both sides of a school or government ID. Both are required to be cleared for pickups.
      </Text>

      <SideUpload label="Front of ID"  uri={frontUri} setter={setFrontUri} sideKey="front" />
      <SideUpload label="Back of ID"   uri={backUri}  setter={setBackUri}  sideKey="back"  />

      <Button
        title={hasBothSides ? 'Create Account' : 'Add both sides to continue'}
        onPress={() => handleSubmit(false)}
        loading={loading}
        disabled={!hasBothSides}
        style={styles.submitBtn}
      />

      <Text style={styles.skip} onPress={() => handleSubmit(true)}>
        Skip for now (you can upload later in Settings → Verify ID)
      </Text>
      <Text style={styles.note}>
        Your ID is stored securely and only visible to BetterNature executives for verification.
      </Text>
     </ResponsiveContainer>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
    ...(Platform.OS === 'web' ? { height: '100vh' } : null),
  },
  content: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  title: { color: Colors.green },
  subtitle: { ...Type.body, color: Colors.gray, marginTop: 4, marginBottom: 18 },
  sideBlock: { marginBottom: 14 },
  sideLabel: { fontSize: 12, fontWeight: '800', color: Colors.dark, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 6 },
  uploadArea: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    height: 160,
    overflow: 'hidden',
    ...Shadows.card,
  },
  preview: { width: '100%', height: '100%', resizeMode: 'cover' },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  placeholderIcon: { fontSize: 36 },
  placeholderText: { ...Type.caption, marginTop: 6 },
  buttonRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  smallBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 10,
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.glassBorder,
    alignItems: 'center',
  },
  smallBtnText: { fontSize: 13, fontWeight: '700', color: Colors.green },
  submitBtn: { marginTop: 16 },
  skip: {
    textAlign: 'center', marginTop: 16, color: Colors.gray, fontSize: 13,
  },
  note: {
    ...Type.caption, textAlign: 'center', marginTop: 10, paddingHorizontal: 20,
  },
});
