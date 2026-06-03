// ID verification — captures BOTH sides of a government-issued ID.
//
// Front and back are stored separately on the user doc:
//   id_document_front_url, id_document_back_url
// The legacy id_document_url field is kept in sync with the front so
// existing thumbnails and the ID gate keep working.
//
// Both photos are required to submit. The dashed wells make it
// obvious which side hasn't been captured yet.
import React, { useState } from 'react';
import {
  View, Text, ScrollView, Image, StyleSheet, TouchableOpacity, Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Colors, Type, Radius } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import Button from '../../components/ui/Button';
import useAuthStore from '../../store/authStore';
import Icon from '../../components/ui/Icon';
import { uploadIdDocument, getProfile } from '../../services/auth';
import { notify, notifyThen } from '../../services/ui';
import Screen from '../../components/ui/Screen';

export default function VerifyIdScreen({ navigation }) {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [frontUri, setFrontUri] = useState(null);
  const [backUri,  setBackUri]  = useState(null);
  const [busy, setBusy] = useState(false);

  async function snapOrPick(setter) {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (perm.granted) {
        const res = await ImagePicker.launchCameraAsync({ quality: 0.8 });
        if (!res.canceled) { setter(res.assets[0].uri); return; }
        return;
      }
      // Fallback to the library if camera permission was denied.
      const lib = await ImagePicker.launchImageLibraryAsync({
        quality: 0.8, mediaTypes: ImagePicker.MediaTypeOptions.Images,
      });
      if (!lib.canceled) setter(lib.assets[0].uri);
    } catch (e) {
      notify('Could not open camera', e?.message || 'Try the photo library instead.');
    }
  }

  async function submit() {
    if (!frontUri) return notify('Front of the ID', 'Take a photo of the FRONT of your ID first.');
    if (!backUri)  return notify('Back of the ID',  'Take a photo of the BACK of your ID too.');
    if (!user?.id) return notify('Not signed in');
    setBusy(true);
    try {
      await uploadIdDocument(user.id, { frontUri, backUri });
      const fresh = await getProfile(user.id);
      if (fresh && setUser) setUser(fresh);
      notifyThen(
        'Submitted',
        'Thanks — an admin will review your ID shortly. You’ll be cleared as soon as it’s approved.',
        () => navigation.goBack(),
      );
    } catch (e) {
      notify('Upload failed', e?.message || 'Try again.');
    } finally { setBusy(false); }
  }

  return (
    <Body>
      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Text style={styles.back}>‹ Back</Text>
      </TouchableOpacity>
      <BrushText variant="screenTitle" style={styles.title}>Verify your ID</BrushText>
      <Text style={styles.subtitle}>
        Two quick photos — the front and the back of any government-issued ID
        (driver’s license, passport, or state ID). Stored privately and only used
        for verification.
      </Text>

      <Well
        label="Front"
        uri={frontUri}
        onPress={() => snapOrPick(setFrontUri)}
      />
      <Well
        label="Back"
        uri={backUri}
        onPress={() => snapOrPick(setBackUri)}
      />

      <Button
        title={busy ? 'Uploading…' : 'Submit ID'}
        onPress={submit}
        loading={busy}
        style={{ marginTop: 18 }}
      />
    </Body>
  );
}

const Body = Platform.OS === 'web'
  ? ({ children }) => React.createElement(
      'div',
      { style: { height: '100vh', width: '100%', overflowY: 'auto', overflowX: 'hidden', WebkitOverflowScrolling: 'touch', backgroundColor: Colors.cream, padding: 24, paddingTop: 60, paddingBottom: 60, boxSizing: 'border-box' } },
      children
    )
  : ({ children }) => (
      <Screen contentStyle={styles.content}>{children}</Screen>
    );

function Well({ label, uri, onPress }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={styles.wellLabel}>{label}</Text>
      <TouchableOpacity style={styles.well} onPress={onPress} activeOpacity={0.85}>
        {uri ? (
          <Image source={{ uri }} style={styles.preview} />
        ) : (
          <>
            <Icon name="id-card" size={42} color={Colors.green} strokeWidth={1.5} />
            <Text style={[styles.wellCta, { marginTop: 8 }]}>Tap to take {label.toLowerCase()}</Text>
            <Text style={styles.wellHelp}>Hold steady. Name + expiration should be readable.</Text>
          </>
        )}
      </TouchableOpacity>
      {uri ? (
        <TouchableOpacity onPress={onPress} style={styles.retake}>
          <Text style={styles.retakeText}>Retake {label.toLowerCase()}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
    ...(Platform.OS === 'web' ? { height: '100vh' } : null),
  },
  content: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  back: { fontSize: 16, color: Colors.green, marginBottom: 8 },
  title: { color: Colors.green },
  subtitle: { ...Type.body, color: Colors.gray, marginTop: 6, marginBottom: 20 },

  wellLabel: { fontSize: 12, fontWeight: '800', color: Colors.dark, letterSpacing: 0.3, textTransform: 'uppercase', marginBottom: 8 },
  well: {
    width: '100%',
    aspectRatio: 16 / 10,
    borderRadius: Radius.lg,
    backgroundColor: Colors.greenLight,
    borderWidth: 2,
    borderColor: Colors.green + '40',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  preview: { width: '100%', height: '100%' },
  wellCta: { fontSize: 15, fontWeight: '700', color: Colors.green },
  wellHelp: { ...Type.caption, color: Colors.gray, marginTop: 4, textAlign: 'center', paddingHorizontal: 12 },
  retake: { alignSelf: 'center', padding: 6, marginTop: 4 },
  retakeText: { fontSize: 13, fontWeight: '600', color: Colors.pink },
});
