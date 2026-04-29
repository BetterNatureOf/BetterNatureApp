import React, { useState } from 'react';
import { View, Text, Image, ScrollView, StyleSheet, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import Button from '../../components/ui/Button';
import { signUp, uploadIdDocument } from '../../services/auth';
import useAuthStore from '../../store/authStore';

export default function SignupStep3({ route }) {
  const userData = route.params;
  const [imageUri, setImageUri] = useState(null);
  const [loading, setLoading] = useState(false);
  const { setUser } = useAuthStore();

  async function pickImage() {
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

    if (!result.canceled) {
      setImageUri(result.assets[0].uri);
    }
  }

  async function takePhoto() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'We need camera access to take a photo of your ID.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.7,
      allowsEditing: true,
    });

    if (!result.canceled) {
      setImageUri(result.assets[0].uri);
    }
  }

  async function handleSubmit() {
    setLoading(true);
    try {
      const authData = await signUp({
        email: userData.email,
        password: userData.password,
        name: userData.name,
        phone: userData.phone,
        city: userData.city,
        zip: userData.zip,
      });

      if (imageUri && authData.user) {
        await uploadIdDocument(authData.user.id, imageUri);
      }

      // Flip auth state so the root navigator switches to Main.
      if (authData?.user) {
        setUser(authData.user);
      }
    } catch (e) {
      Alert.alert('Sign Up Failed', e.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <BrushText variant="screenTitle" style={styles.title}>
        Verify Your Identity
      </BrushText>
      <Text style={styles.subtitle}>
        Upload a photo of your school or government ID. This helps us keep our community safe.
      </Text>

      <View style={styles.uploadArea}>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.preview} />
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderIcon}>📄</Text>
            <Text style={styles.placeholderText}>No ID uploaded yet</Text>
          </View>
        )}
      </View>

      <View style={styles.buttonRow}>
        <Button
          title="Choose Photo"
          variant="secondary"
          onPress={pickImage}
          style={styles.halfBtn}
        />
        <Button
          title="Take Photo"
          variant="secondary"
          onPress={takePhoto}
          style={styles.halfBtn}
        />
      </View>

      <Button
        title="Create Account"
        onPress={handleSubmit}
        loading={loading}
        style={styles.submitBtn}
      />

      <Text style={styles.skip} onPress={handleSubmit}>
        Skip for now
      </Text>
      <Text style={styles.note}>
        Your ID is stored securely and only visible to BetterNature executives for verification.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  content: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  title: { color: Colors.green },
  subtitle: { ...Type.body, color: Colors.gray, marginTop: 4, marginBottom: 24 },
  uploadArea: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    height: 220,
    overflow: 'hidden',
    ...Shadows.card,
  },
  preview: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderIcon: { fontSize: 48 },
  placeholderText: { ...Type.caption, marginTop: 8 },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  halfBtn: { flex: 1 },
  submitBtn: { marginTop: 24 },
  skip: {
    textAlign: 'center',
    marginTop: 16,
    color: Colors.gray,
    fontSize: 14,
  },
  note: {
    ...Type.caption,
    textAlign: 'center',
    marginTop: 12,
    paddingHorizontal: 20,
  },
});
