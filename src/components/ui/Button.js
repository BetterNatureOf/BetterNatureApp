import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Colors, Type } from '../../config/theme';
import { Radius, Shadows } from '../../config/theme';

/**
 * Button — primary pink pill, secondary outline, or small variant.
 * variant: 'primary' | 'secondary' | 'small'
 */
export default function Button({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  style,
}) {
  const isPrimary = variant === 'primary';
  const isSmall = variant === 'small';

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
      style={[
        styles.base,
        isPrimary && styles.primary,
        variant === 'secondary' && styles.secondary,
        isSmall && styles.small,
        (disabled || loading) && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? Colors.white : Colors.pink} />
      ) : (
        <Text
          style={[
            styles.text,
            isPrimary && styles.primaryText,
            variant === 'secondary' && styles.secondaryText,
            isSmall && styles.smallText,
          ]}
        >
          {title}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 52,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  primary: {
    backgroundColor: Colors.pink,
    ...Shadows.button,
  },
  secondary: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: Colors.pink,
  },
  small: {
    height: 36,
    borderRadius: 18,
    paddingHorizontal: 16,
    backgroundColor: Colors.pink,
  },
  disabled: {
    opacity: 0.5,
  },
  text: {
    ...Type.button,
  },
  primaryText: {
    color: Colors.white,
  },
  secondaryText: {
    color: Colors.pink,
  },
  smallText: {
    color: Colors.white,
    fontSize: 13,
    fontWeight: '600',
  },
});
