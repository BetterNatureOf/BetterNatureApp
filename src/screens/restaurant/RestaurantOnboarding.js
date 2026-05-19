// Restaurant onboarding. Collected once after a partner account is
// created so every pickup they post has a real business name, address,
// and contact number on the volunteer's screen.
//
// Writes to:
//   - restaurants/{userId}  (canonical business record)
//   - users/{uid}           (mirrors fields the app reads from `user`)
//
// Routed to automatically from RestDashboard when restaurant_complete
// isn't true on the user doc. Skippable for now — but the next time the
// user tries to post surplus we hard-gate them through this screen.
import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { Colors, Type } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import PlaceInput from '../../components/ui/PlaceInput';
import ResponsiveContainer from '../../components/ui/ResponsiveContainer';
import AnimatedPressable from '../../components/ui/AnimatedPressable';
import Icon from '../../components/ui/Icon';
import useAuthStore from '../../store/authStore';
import { updateProfile, getProfile } from '../../services/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../../config/firebase';
import { notify, notifyThen } from '../../services/ui';

export default function RestaurantOnboarding({ navigation }) {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  const [businessName, setBusinessName] = useState(user?.business_name || user?.name || '');
  const [contactName, setContactName] = useState(user?.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [address, setAddress] = useState(user?.address || '');
  const [city, setCity] = useState(user?.city || '');
  const [state, setState] = useState(user?.state || '');
  const [zip, setZip] = useState(user?.zip || '');
  const [lat, setLat] = useState(user?.lat ? String(user.lat) : '');
  const [lng, setLng] = useState(user?.lng ? String(user.lng) : '');
  const [hours, setHours] = useState(user?.hours || '');
  const [notes, setNotes] = useState(user?.pickup_notes || '');
  const [saving, setSaving] = useState(false);

  function validate() {
    if (!businessName.trim()) { notify('Business name required'); return false; }
    if (!address.trim() || !city.trim() || !state.trim()) {
      notify('Address required', 'Volunteers need a real address to drive to.'); return false;
    }
    if (!phone.trim()) { notify('Contact phone required', 'So we can reach you on pickup day.'); return false; }
    return true;
  }

  async function save() {
    if (!validate()) return;
    if (!user?.id) return notify('Not signed in');
    setSaving(true);
    try {
      const latN = lat ? parseFloat(lat) : null;
      const lngN = lng ? parseFloat(lng) : null;

      const restaurantDoc = {
        business_name: businessName.trim(),
        contact_name: contactName.trim(),
        phone: phone.trim(),
        address: address.trim(),
        city: city.trim(),
        state: state.trim(),
        zip: zip.trim(),
        lat: latN,
        lng: lngN,
        hours: hours.trim(),
        pickup_notes: notes.trim(),
        owner_uid: user.id,
        approved: user?.approved ?? false,
        updated_at: serverTimestamp(),
      };
      if (isFirebaseConfigured) {
        await setDoc(doc(db, 'restaurants', user.id), {
          ...restaurantDoc,
          created_at: serverTimestamp(),
        }, { merge: true });
      }
      // Mirror onto the user doc so user.* fields stay populated for the
      // ScheduleDonation form prefills and the DashboardHeader greeting.
      await updateProfile(user.id, {
        business_name: businessName.trim(),
        name: businessName.trim(),
        phone: phone.trim(),
        address: address.trim(),
        city: city.trim(),
        state: state.trim(),
        zip: zip.trim(),
        lat: latN,
        lng: lngN,
        hours: hours.trim(),
        pickup_notes: notes.trim(),
        restaurant_complete: true,
        restaurant_id: user.id,
      });
      const fresh = await getProfile(user.id);
      if (fresh && setUser) setUser(fresh);
      notifyThen('Saved', 'Your restaurant is ready to post surplus.', () => navigation.goBack());
    } catch (e) {
      notify('Could not save', e?.message || 'Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ResponsiveContainer maxWidth={720}>
          <AnimatedPressable onPress={() => navigation.goBack()} style={styles.back} scaleTo={0.97}>
            <Icon name="back" size={18} color={Colors.green} />
            <Text style={styles.backText}>Back</Text>
          </AnimatedPressable>
          <BrushText variant="screenTitle" style={styles.title}>Set up your restaurant</BrushText>
          <Text style={styles.subtitle}>
            One quick form, then you can post surplus in 60 seconds. Volunteers see your business name, address, and contact when they claim a pickup.
          </Text>

          <Field label="Business name">
            <Input value={businessName} onChangeText={setBusinessName} placeholder="Sunny Cafe" />
          </Field>

          <Field label="Contact name">
            <Input value={contactName} onChangeText={setContactName} placeholder="Who runs the back of house" />
          </Field>

          <Field label="Contact phone">
            <Input value={phone} onChangeText={setPhone} placeholder="(555) 123-4567" keyboardType="phone-pad" />
          </Field>

          <Field label="Street address">
            <Input value={address} onChangeText={setAddress} placeholder="2150 Young Ave" />
          </Field>

          <Field label="City">
            <PlaceInput
              value={city}
              onChange={(v) => {
                const m = /,\s*([A-Z]{2})$/.exec(v || '');
                if (m) { setCity(v.split(',')[0]); setState(m[1]); }
                else setCity(v);
              }}
              placeholder="Memphis"
            />
          </Field>

          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Field label="State"><Input value={state} onChangeText={setState} autoCapitalize="characters" maxLength={2} placeholder="TN" /></Field>
            </View>
            <View style={{ width: 12 }} />
            <View style={{ flex: 1 }}>
              <Field label="ZIP"><Input value={zip} onChangeText={setZip} keyboardType="number-pad" maxLength={5} placeholder="38104" /></Field>
            </View>
          </View>

          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Field label="Latitude"><Input value={lat} onChangeText={setLat} keyboardType="decimal-pad" placeholder="35.1240" /></Field>
            </View>
            <View style={{ width: 12 }} />
            <View style={{ flex: 1 }}>
              <Field label="Longitude"><Input value={lng} onChangeText={setLng} keyboardType="decimal-pad" placeholder="-89.9970" /></Field>
            </View>
          </View>
          <Text style={styles.hint}>
            Optional but powerful: with lat/lng, volunteers get one-tap "Open in Maps" directions. Grab coords by right-clicking your storefront in Google Maps.
          </Text>

          <Field label="Pickup hours">
            <Input value={hours} onChangeText={setHours} placeholder="Tue–Sun, 8pm–10pm" />
          </Field>

          <Field label="Notes for volunteers (optional)">
            <Input value={notes} onChangeText={setNotes} placeholder="Park out back, ring the bell, ask for Mike" multiline style={{ height: 70 }} />
          </Field>

          <Button title={saving ? 'Saving…' : 'Save & continue'} onPress={save} loading={saving} style={{ marginTop: 22 }} />
        </ResponsiveContainer>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, children }) {
  return (
    <View style={{ marginTop: 16 }}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  content: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 },
  backText: { fontSize: 15, color: Colors.green, fontWeight: '600' },
  title: { color: Colors.green, marginTop: 4 },
  subtitle: { ...Type.body, color: Colors.gray, marginTop: 6, marginBottom: 8 },
  label: { fontSize: 13, fontWeight: '700', color: Colors.dark, marginBottom: 6 },
  row: { flexDirection: 'row' },
  hint: { ...Type.caption, color: Colors.gray, marginTop: 4 },
});
