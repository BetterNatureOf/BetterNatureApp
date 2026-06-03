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
import { emailAlreadyRegistered } from '../../services/auth';
import { phoneAlreadyRegistered } from '../../services/duplicates';
import { notify } from '../../services/ui';

export default function SignupStep1({ navigation }) {
  const [checking, setChecking] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
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
    navigation.navigate('SignupStep2', { name, email, password, phone, city, zip });
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
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
          label="Phone (optional)"
          placeholder="(555) 123-4567"
          value={phone}
          onChangeText={setPhone}
          error={errors.phone}
          keyboardType="phone-pad"
        />
        <View style={styles.row}>
          <Input
            label="City"
            placeholder="City"
            value={city}
            onChangeText={setCity}
            containerStyle={styles.halfInput}
          />
          <Input
            label="ZIP Code"
            placeholder="ZIP"
            value={zip}
            onChangeText={setZip}
            keyboardType="number-pad"
            containerStyle={styles.halfInput}
          />
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
      </ScrollView>
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
