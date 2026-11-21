import React, { forwardRef, useId, useState } from 'react';
import { View, TextInput, Text, StyleSheet, Platform } from 'react-native';
import { Colors, Radius } from '../../config/theme';

// Darker than the old #EF4444 so small error text meets 4.5:1 contrast.
const ERROR = '#B42318';

/**
 * Input — styled form input with label and optional error.
 *
 * Accessibility: the visible label is the input's accessible name, the
 * field is marked invalid when `error` is set, and the error text is
 * announced politely when it appears. `right` renders an accessory
 * (e.g. a show-password button) inside the field.
 */
const Input = forwardRef(function Input({
  label,
  error,
  hint,
  right,
  style,
  containerStyle,
  ...props
}, ref) {
  const [focused, setFocused] = useState(false);
  const id = useId?.() || undefined;
  const labelId = id && `${id}-label`;
  const errorId = id && `${id}-error`;
  const web = Platform.OS === 'web';

  return (
    <View style={[styles.container, containerStyle]}>
      {label && <Text style={styles.label} nativeID={labelId}>{label}</Text>}
      <View style={[
        styles.inputWrap,
        focused && styles.focused,
        error && styles.error,
      ]}>
        <TextInput
          ref={ref}
          style={[styles.input, style]}
          placeholderTextColor={Colors.grayMid}
          accessibilityLabel={label}
          accessibilityHint={hint}
          {...(web ? {
            'aria-labelledby': label ? labelId : undefined,
            'aria-invalid': error ? true : undefined,
            'aria-describedby': error ? errorId : undefined,
          } : null)}
          {...props}
          onFocus={(e) => { setFocused(true); props.onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); props.onBlur?.(e); }}
        />
        {right}
      </View>
      {!!error && (
        <Text style={styles.errorText} nativeID={errorId} accessibilityLiveRegion="polite"
          {...(web ? { role: 'alert' } : null)}>
          {error}
        </Text>
      )}
    </View>
  );
});

export default Input;

const styles = StyleSheet.create({
  container: {
    marginBottom: 18,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.dark,
    marginBottom: 8,
    letterSpacing: 0.2,
  },
  inputWrap: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.grayLight,
    backgroundColor: Colors.white,
    overflow: 'hidden',
  },
  input: {
    flex: 1,
    alignSelf: 'stretch',
    paddingHorizontal: 16,
    fontSize: 16,
    color: Colors.dark,
  },
  focused: {
    borderColor: Colors.green,
    backgroundColor: Colors.greenLight + '40',
  },
  error: {
    borderColor: ERROR,
  },
  errorText: {
    fontSize: 13,
    color: ERROR,
    marginTop: 6,
    fontWeight: '500',
  },
});
