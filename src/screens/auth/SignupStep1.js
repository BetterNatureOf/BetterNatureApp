import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Colors, Type, Spacing } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import ResponsiveContainer from '../../components/ui/ResponsiveContainer';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { TouchableOpacity } from 'react-native';
import { emailAlreadyRegistered } from '../../services/auth';
import { phoneAlreadyRegistered } from '../../services/duplicates';
import { notify } from '../../services/ui';
import Screen from '../../components/ui/Screen';
import CityStateAutocomplete from '../../components/ui/CityStateAutocomplete';

export default function SignupStep1({ navigation }) {
  const [checking, setChecking] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [scope, setScope] = useState('national'); // 'national' | 'international'
  const [city, setCity] = useState('');
  const [state, setStateVal] = useState('');
  const [country, setCountry] = useState('USA');
  const [zip, setZip] = useState('');
  const [errors, setErrors] = useState({});

  // Top-of-form banner message. We surface validation + duplicate errors
  // BOTH here and as a popup, because the inline red text under each
  // input was easy to miss (especially on a tall form where the empty
  // password is below the fold).
  const [banner, setBanner] = useState(null);

  function validate() {
    const e = {};
    if (!name.trim()) e.name = 'Name is required';
    if (!email.trim()) e.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(email)) e.email = 'Invalid email';
    if (!password) e.password = 'Password is required';
    else if (password.length < 6) e.password = 'At least 6 characters';
    // Phone is now required — we use SMS for pickup alerts, event
    // reminders, and safety dispatch. Mirrors the consent the user
    // signs at contract time.
    const digits = (phone || '').replace(/\D/g, '');
    if (!phone.trim()) e.phone = 'Phone is required';
    else if (digits.length < 7) e.phone = 'Enter a valid phone number';
    if (!city.trim()) e.city = 'City is required';
    if (scope === 'national' && !state.trim()) e.state = 'State is required';
    setErrors(e);
    if (Object.keys(e).length) {
      const first = Object.values(e)[0];
      setBanner({ code: 'BN-001', text: first });
    } else {
      setBanner(null);
    }
    return Object.keys(e).length === 0;
  }

  function showError(code, fieldKey, text) {
    setErrors((prev) => ({ ...prev, [fieldKey]: text }));
    setBanner({ code, text });
    notify('Account error ' + code, text);
  }

  async function handleNext() {
    if (!validate()) return;
    // Preflight: catch a duplicate email AND duplicate phone here so the
    // user doesn't burn through Step 2 and Step 3 only to find out at
    // Submit. Firebase Auth re-checks the email at create time as the
    // authoritative gate; phone uniqueness is enforced in Firestore at
    // create time via duplicates.js → phoneAlreadyRegistered.
    setChecking(true);
    try {
      const cleanEmail = email.trim().toLowerCase();
      const cleanPhone = (phone || '').replace(/\D/g, '');

      const [emailTaken, phoneTaken] = await Promise.all([
        emailAlreadyRegistered(cleanEmail),
        cleanPhone.length >= 10 ? phoneAlreadyRegistered(cleanPhone) : Promise.resolve(false),
      ]);

      if (emailTaken) {
        showError('BN-101', 'email',
          'That email is already registered. Sign in instead, or use a different email.');
        return;
      }
      if (phoneTaken) {
        showError('BN-102', 'phone',
          'That phone number is already on another BetterNature account.');
        return;
      }
    } catch (err) {
      // Lookup failed — log but let user proceed; create-time still blocks.
      console.warn('Signup preflight failed:', err);
    } finally {
      setChecking(false);
    }
    setBanner(null);
    navigation.navigate('SignupStep2', { name, email, password, phone, city, state, country, zip });
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen contentStyle={styles.content} keyboardShouldPersistTaps="handled">
       <ResponsiveContainer maxWidth={520}>
        <BrushText variant="screenTitle" style={styles.title}>
          Join BetterNature
        </BrushText>
        <Text style={styles.subtitle}>Tell us about yourself</Text>

        {banner ? (
          <View style={styles.banner}>
            <Text style={styles.bannerCode}>{banner.code}</Text>
            <Text style={styles.bannerText}>{banner.text}</Text>
          </View>
        ) : null}

        <Input
          label="Full Name"
          placeholder="Your name"
          value={name}
          onChangeText={setName}
          error={errors.name}
          autoCapitalize="words"
        />
        <Input
          label="Email"
          placeholder="you@email.com"
          value={email}
          onChangeText={setEmail}
          error={errors.email}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <Input
          label="Password"
          placeholder="At least 6 characters"
          value={password}
          onChangeText={setPassword}
          error={errors.password}
          secureTextEntry
        />
        <Input
          label="Phone *"
          placeholder="(555) 123-4567"
          value={phone}
          onChangeText={setPhone}
          error={errors.phone}
          keyboardType="phone-pad"
        />

        {/* National / International toggle. National constrains the
            city autocomplete to the US and shows the State + ZIP
            fields; International opens it world-wide and shows the
            Country chip with a free-form state/region. */}
        <Text style={styles.label}>Where are you?</Text>
        <View style={styles.scopeRow}>
          {[
            { key: 'national',      label: 'United States' },
            { key: 'international', label: 'International' },
          ].map((opt) => {
            const active = scope === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                style={[styles.scopeChip, active && styles.scopeChipActive]}
                onPress={() => {
                  setScope(opt.key);
                  // Reset selection when switching scope so a US pick
                  // doesn't leak into the international tab.
                  setCity(''); setStateVal('');
                  setCountry(opt.key === 'national' ? 'USA' : '');
                }}
                activeOpacity={0.85}
              >
                <Text style={[styles.scopeChipText, active && styles.scopeChipTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <CityStateAutocomplete
          label="City *"
          value={city}
          onChangeText={setCity}
          countryFilter={scope === 'national' ? 'us' : undefined}
          error={errors.city}
          onSelect={(p) => {
            setCity(p.city);
            setStateVal(p.state);
            setCountry(p.countryCode || p.country || (scope === 'national' ? 'USA' : ''));
          }}
        />
        <View style={styles.row}>
          <Input
            label={scope === 'national' ? 'State *' : 'State / region'}
            placeholder={scope === 'national' ? 'TN' : 'Region'}
            value={state}
            onChangeText={setStateVal}
            error={errors.state}
            containerStyle={styles.halfInput}
            autoCapitalize="characters"
            maxLength={scope === 'national' ? 4 : 60}
          />
          {scope === 'national' ? (
            <Input
              label="ZIP code"
              placeholder="ZIP"
              value={zip}
              onChangeText={setZip}
              keyboardType="number-pad"
              containerStyle={styles.halfInput}
            />
          ) : (
            <Input
              label="Country"
              placeholder="USA / UK / IND…"
              value={country}
              onChangeText={setCountry}
              containerStyle={styles.halfInput}
              autoCapitalize="characters"
              maxLength={3}
            />
          )}
        </View>

        <Button
          title={checking ? 'Checking…' : 'Next'}
          onPress={handleNext}
          loading={checking}
          disabled={checking}
          style={styles.btn}
        />

        <Text style={styles.loginLink} onPress={() => navigation.navigate('Login')}>
          Already have an account? <Text style={styles.loginBold}>Sign in</Text>
        </Text>
       </ResponsiveContainer>
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
  content: { padding: 24, paddingTop: 60 },
  title: { color: Colors.green },
  subtitle: { ...Type.body, color: Colors.gray, marginTop: 4, marginBottom: 24 },
  row: { flexDirection: 'row', gap: 12 },
  halfInput: { flex: 1 },
  label: { ...Type.label, color: Colors.dark, marginBottom: 6, marginTop: 4 },
  scopeRow: { flexDirection: 'row', gap: 8, marginBottom: 14, backgroundColor: '#F7F5EF', padding: 4, borderRadius: 999 },
  scopeChip: { flex: 1, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 999, alignItems: 'center' },
  scopeChipActive: { backgroundColor: Colors.white, shadowColor: '#000', shadowOpacity: 0.06, shadowOffset: { width: 0, height: 1 }, shadowRadius: 3, elevation: 2 },
  scopeChipText: { fontSize: 13, fontWeight: '700', color: Colors.gray, letterSpacing: 0.3 },
  scopeChipTextActive: { color: Colors.green },
  btn: { marginTop: 8 },
  loginLink: { textAlign: 'center', marginTop: 20, ...Type.caption },
  loginBold: { color: Colors.pink, fontWeight: '600' },
  banner: {
    backgroundColor: '#FFE5EE',
    borderLeftWidth: 4,
    borderLeftColor: '#C41E5A',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  bannerCode: {
    fontSize: 11,
    fontWeight: '800',
    color: '#C41E5A',
    letterSpacing: 0.5,
    backgroundColor: 'rgba(196,30,90,0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  bannerText: {
    flex: 1,
    fontSize: 13,
    color: '#7A1838',
    lineHeight: 18,
  },
});
