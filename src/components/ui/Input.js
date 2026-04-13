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
      <View style={[
        styles.inputWrap,
        focused && styles.focused,
        error && styles.error,
      ]}>
        <TextInput
          style={[styles.input, style]}
          placeholderTextColor={Colors.grayMid}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          {...props}
        />
      </View>
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 18,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.dark,
    marginBottom: 8,
    letterSpacing: 0.2,
  },
  inputWrap: {
    height: 50,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.grayLight,
    backgroundColor: Colors.white,
    overflow: 'hidden',
  },
  input: {
    flex: 1,
    paddingHorizontal: 16,
    fontSize: 15,
    color: Colors.dark,
  },
  focused: {
    borderColor: Colors.green,
    backgroundColor: Colors.greenLight + '40',
  },
  error: {
    borderColor: '#EF4444',
  },
  errorText: {
    fontSize: 12,
    color: '#EF4444',
    marginTop: 6,
  },
});
