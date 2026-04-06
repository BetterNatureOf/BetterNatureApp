import React, { useState } from 'react';
import { View, TextInput, Text, StyleSheet } from 'react-native';
import { Colors, Type, Radius } from '../../config/theme';

/**
 * Input — styled form input with label and optional error.
 */
export default function Input({
  label,
  error,
  style,
  containerStyle,
  ...props
}) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.container, containerStyle]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TextInput
        style={[
          styles.input,
          focused && styles.focused,
          error && styles.error,
          style,
        ]}
        placeholderTextColor={Colors.grayMid}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        {...props}
      />
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    ...Type.body,
    fontWeight: '500',
    color: Colors.dark,
    marginBottom: 6,
  },
  input: {
    height: 48,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.grayLight,
    paddingHorizontal: 14,
    fontSize: 15,
    color: Colors.dark,
    backgroundColor: Colors.white,
  },
  focused: {
    borderColor: Colors.pink,
  },
  error: {
    borderColor: '#EF4444',
  },
  errorText: {
    fontSize: 12,
    color: '#EF4444',
    marginTop: 4,
  },
});
