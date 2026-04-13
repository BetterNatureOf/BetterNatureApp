import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Type } from '../../config/theme';
import { Radius, Shadows } from '../../config/theme';
import { hp } from '../../config/scale';

/**
 * Button — gradient primary, outlined secondary, or small variant.
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

  if (isPrimary || isSmall) {
    return (
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled || loading}
        activeOpacity={0.85}
        style={[
          (disabled || loading) && styles.disabled,
          style,
        ]}
      >
        <LinearGradient
          colors={Colors.gradient.pink}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[
            styles.base,
            isPrimary && styles.primary,
            isSmall && styles.small,
          ]}
        >
          {loading ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <Text style={[styles.text, styles.primaryText, isSmall && styles.smallText]}>
              {title}
            </Text>
          )}
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
      style={[
        styles.base,
        styles.secondary,
        (disabled || loading) && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={Colors.pink} />
      ) : (
        <Text style={[styles.text, styles.secondaryText]}>
          {title}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    height: hp(52),
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  primary: {
    ...Shadows.button,
  },
  secondary: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: Colors.pink,
  },
  small: {
    height: hp(38),
    borderRadius: 19,
    paddingHorizontal: 18,
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
