import React from 'react';
import { Image, StyleSheet } from 'react-native';

// The circular BetterNature mark — already pre-cropped to a circle, so we
// just render it at the requested size. Wrapped here so every screen pulls
// from one source of truth: swap the file at src/assets/images/logo-circle.png
// and every instance updates at once.
const SOURCE = require('../../assets/images/logo-circle.png');

export default function Logo({ size = 96, style }) {
  return (
    <Image
      source={SOURCE}
      style={[{ width: size, height: size, borderRadius: size / 2 }, style]}
      resizeMode="contain"
      accessibilityLabel="BetterNature logo"
    />
  );
}
