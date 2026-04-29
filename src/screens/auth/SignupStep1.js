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
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';

export default function SignupStep1({ navigation }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [zip, setZip] = useState('');
  const [errors, setErrors] = useState({});

  function validate() {
    const e = {};
    if (!name.trim()) e.name = 'Name is required';
    if (!email.trim()) e.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(email)) e.email = 'Invalid email';
    if (!password) e.password = 'Password is required';
    else if (password.length < 6) e.password = 'At least 6 characters';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleNext() {
    if (!validate()) return;
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
        <BrushText variant="screenTitle" style={styles.title}>
          Join BetterNature
        </BrushText>
        <Text style={styles.subtitle}>Tell us about yourself</Text>

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

        <Button title="Next" onPress={handleNext} style={styles.btn} />

        <Text style={styles.loginLink} onPress={() => navigation.navigate('Login')}>
          Already have an account? <Text style={styles.loginBold}>Sign in</Text>
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: Colors.cream },
  content: { padding: 24, paddingTop: 60 },
  title: { color: Colors.green },
  subtitle: { ...Type.body, color: Colors.gray, marginTop: 4, marginBottom: 24 },
  row: { flexDirection: 'row', gap: 12 },
  halfInput: { flex: 1 },
  btn: { marginTop: 8 },
  loginLink: { textAlign: 'center', marginTop: 20, ...Type.caption },
  loginBold: { color: Colors.pink, fontWeight: '600' },
});
