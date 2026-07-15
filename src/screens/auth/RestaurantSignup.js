import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { Colors, Type, Radius } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { createRestaurant, updateRestaurant, fetchChapters } from '../../services/database';
import { signUp, updateProfile } from '../../services/auth';
import { notify, notifyThen } from '../../services/ui';
import useAuthStore, { ROLES } from '../../store/authStore';
import Screen from '../../components/ui/Screen';
import { PARTNER_TYPES } from '../../config/partnerTypes';

export default function RestaurantSignup({ navigation }) {
  const setUser = useAuthStore((s) => s.setUser);
  const [form, setForm] = useState({
    name: '',
    address: '',
    contact_name: '',
    email: '',
    password: '',
    phone: '',
    food_type: '',
    frequency: '',
    chapter_id: '',
    // Default 'restaurant' since most signups still are. The picker
    // just below the org-name field lets churches / gardens / etc.
    // pick their type so the app doesn't call them a restaurant.
    partner_type: 'restaurant',
  });
  const [chapters, setChapters] = useState([]);
  const [loading, setLoading] = useState(false);

  // Pull the live chapter list so the restaurant can pick their
  // local one. Pickup notifications fan out by chapter_id, so this
  // is the only way the right volunteers get pinged.
  useEffect(() => {
    let alive = true;
    fetchChapters().then((list) => { if (alive) setChapters(list); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  function update(key, val) {
    setForm((prev) => ({ ...prev, [key]: val }));
  }

  async function handleSubmit() {
    if (!form.name.trim() || !form.email.trim() || !form.password) {
      notify('Required', 'Please fill in organization name, email, and password.');
      return;
    }
    if (!form.chapter_id) {
      notify('Pick a chapter', 'Choose the BetterNature chapter closest to your organization. Only volunteers in that chapter will be notified about your donations.');
      return;
    }
    if (form.password.length < 6) {
      notify('Password too short', 'Use at least 6 characters.');
      return;
    }

    setLoading(true);
    try {
      // 1) Create the Firebase Auth account with the restaurant's
      //    chosen password so they can log in later.
      const chosen = chapters.find((c) => c.id === form.chapter_id);
      const authData = await signUp({
        email: form.email,
        password: form.password,
        name: form.name,
        phone: form.phone,
        city: '',
        zip: '',
        role: ROLES.RESTAURANT,
      });
      const uid = authData?.user?.id;
      // Flag the user doc as restaurant_status:'incomplete' BEFORE
      // the /restaurants doc write. If the browser dies between
      // signUp and createRestaurant, the next sign-in sees the
      // incomplete flag and can recover instead of stranding the
      // user on a restaurant dashboard with no partner record.
      if (uid) {
        try { await updateProfile(uid, { restaurant_status: 'incomplete' }); } catch {}
      }

      // 2) Create the restaurant doc in pending state, linked to the
      //    user's uid so exec can match it back to the Auth account.
      //    chapter_id drives BOTH pickup notification fan-out and
      //    LiveOps scoping for the chapter president.
      const created = await createRestaurant({
        ...form,
        password: undefined, // never persist plaintext
        user_id: uid,
        chapter_id: form.chapter_id,
        chapter_name: chosen?.name || '',
      });

      // 3) Mirror restaurant_id + restaurant_status + chapter_id on
      //    the user doc so the dashboard gate + ScheduleDonation
      //    flow can read them on login without a join.
      if (uid) {
        try {
          await updateProfile(uid, {
            restaurant_id: created?.id || null,
            restaurant_status: 'pending',
            chapter_id: form.chapter_id,
            chapter_name: chosen?.name || '',
            partner_type: form.partner_type,
          });
        } catch {}
      }

      // 4) Log them in. The RestaurantNavigator's pending gate will
      //    show an "awaiting approval" screen until an exec flips the
      //    status to 'approved' in Manage Restaurants.
      if (authData?.user) {
        setUser({
          ...authData.user,
          role: ROLES.RESTAURANT,
          restaurant_id: created?.id || null,
          restaurant_status: 'pending',
          chapter_id: form.chapter_id,
          chapter_name: chosen?.name || '',
          partner_type: form.partner_type,
        });
      }

      notifyThen(
        'Application received',
        "Thanks! A BetterNature executive will review your application in the app. You'll see your dashboard unlock as soon as you're approved.",
        () => {}, // setUser above already routes them to the awaiting-approval gate
      );
    } catch (e) {
      // Surface the real reason instead of the generic 'Failed to submit'
      // so we can tell duplicate-email from rule-denied from network.
      const msg = e?.message || e?.code || 'Failed to submit';
      notify('Could not submit', msg + '\n\nIf this keeps happening, email info@betternatureofficial.org with what you tried.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen contentStyle={styles.content} keyboardShouldPersistTaps="handled">
        <BrushText variant="screenTitle" style={styles.title}>
          Food Donor Partner Signup
        </BrushText>
        <Text style={styles.subtitle}>
          Restaurants, churches, community gardens, schools, food banks — any organization with edible surplus. Join BetterNature's rescue network.
        </Text>

        {/* Partner type — drives the labels every screen shows for
            this account after signup ("Church Dashboard" vs
            "Restaurant Dashboard" etc.). */}
        <Text style={styles.fieldLabel}>What kind of partner are you?</Text>
        <View style={styles.typeGrid}>
          {PARTNER_TYPES.map((t) => {
            const on = form.partner_type === t.key;
            return (
              <TouchableOpacity
                key={t.key}
                onPress={() => update('partner_type', t.key)}
                activeOpacity={0.85}
                style={[styles.typeChip, on && styles.typeChipActive]}
              >
                <Text style={[styles.typeChipText, on && styles.typeChipTextActive]}>
                  {t.icon} {t.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Input
          label="Organization Name"
          placeholder="Your organization"
          value={form.name}
          onChangeText={(v) => update('name', v)}
        />
        <Input
          label="Address"
          placeholder="123 Main St, City, State"
          value={form.address}
          onChangeText={(v) => update('address', v)}
        />

        {/* Chapter picker — REQUIRED. Drives pickup notification
            fan-out and LiveOps scoping for the local chapter pres. */}
        <Text style={styles.fieldLabel}>BetterNature chapter</Text>
        <Text style={styles.fieldHelp}>
          Pick the chapter closest to your restaurant. Only volunteers in that chapter will see your pickup posts.
        </Text>
        {chapters.length === 0 ? (
          <Text style={styles.fieldHelp}>Loading chapters…</Text>
        ) : (
          <View style={styles.chapterGrid}>
            {chapters.map((c) => {
              const active = c.id === form.chapter_id;
              return (
                <TouchableOpacity
                  key={c.id}
                  onPress={() => update('chapter_id', c.id)}
                  activeOpacity={0.85}
                  style={[styles.chapterChip, active && styles.chapterChipActive]}
                >
                  <Text style={[styles.chapterChipText, active && styles.chapterChipTextActive]} numberOfLines={1}>
                    {c.name || `BetterNature ${c.city || ''}`}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
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
          label="Password"
          placeholder="At least 6 characters"
          value={form.password}
          onChangeText={(v) => update('password', v)}
          secureTextEntry
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
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
    ...(Platform.OS === 'web' ? { height: '100vh' } : null),
  },
  content: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  title: { color: Colors.green },
  subtitle: { ...Type.body, color: Colors.gray, marginTop: 4, marginBottom: 24 },
  btn: { marginTop: 8 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: Colors.dark, marginTop: 14, marginBottom: 4 },
  fieldHelp: { ...Type.caption, color: Colors.grayMid, marginBottom: 8, lineHeight: 18 },
  chapterGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  chapterChip: {
    paddingVertical: 9, paddingHorizontal: 14,
    backgroundColor: Colors.white,
    borderRadius: Radius.pill,
    borderWidth: 1, borderColor: Colors.glassBorder,
    maxWidth: 220,
  },
  chapterChipActive: { backgroundColor: Colors.green, borderColor: Colors.green },
  chapterChipText: { fontSize: 13, fontWeight: '600', color: Colors.dark },
  chapterChipTextActive: { color: '#FFF' },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  typeChip: {
    paddingVertical: 8, paddingHorizontal: 12,
    backgroundColor: Colors.white,
    borderRadius: Radius.pill,
    borderWidth: 1, borderColor: Colors.glassBorder,
  },
  typeChipActive: { backgroundColor: Colors.green, borderColor: Colors.green },
  typeChipText: { fontSize: 12, fontWeight: '600', color: Colors.dark },
  typeChipTextActive: { color: '#FFF' },
});
