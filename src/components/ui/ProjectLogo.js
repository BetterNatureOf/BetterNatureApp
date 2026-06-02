// Project logo registry + framed container.
//
// Usage:
//   <ProjectLogo project="iris" size={64} />                ← default: circle frame
//   <ProjectLogo project="hydro" size={108} shape="square"/> ← rounded square
//   <ProjectLogo project="evergreen" size={48} bare />       ← no frame
//
// The frame:
//   • Soft project-tinted background so the logo stands on its own
//   • Thin 1.5px outline in the project's brand color so it reads as
//     a deliberate badge rather than a flat tile
//   • Inner padding so the logo "breathes" instead of touching the edge
//   • Optional shape: 'circle' (default) or 'square' (rounded-square)
//
// Falls back to a tinted-initial badge when the bundled PNG hasn't been
// dropped in yet, so missing assets never break the bundle.
import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { Colors } from '../../config/theme';

function tryRequire(loader) {
  try { return loader(); } catch { return null; }
}

const SOURCES = {
  iris:      tryRequire(() => require('../../assets/projects/iris.png')),
  hydro:     tryRequire(() => require('../../assets/projects/hydro.png')),
  evergreen: tryRequire(() => require('../../assets/projects/evergreen.png')),
};

// Brand tones used by the frame.
const TONE = {
  iris:      { color: Colors.pink,  bg: '#FFE5EE', border: 'rgba(255,77,141,0.35)', initial: 'I' },
  hydro:     { color: Colors.sky,   bg: '#E1EDFA', border: 'rgba(30,136,229,0.30)', initial: 'H' },
  evergreen: { color: Colors.green, bg: '#DFF1E2', border: 'rgba(46,125,50,0.30)',  initial: 'E' },
};

export default function ProjectLogo({
  project,
  size = 56,
  shape = 'circle',
  bare = false,
  style,
}) {
  const key = String(project || '').toLowerCase();
  const tone = TONE[key] || TONE.iris;
  const src  = SOURCES[key];

  // The frame: same size as `size`. The image inside is inset 18% so
  // logos with their own padding (IRIS) and logos that fill the bounding
  // box (HYDRO, EVERGREEN) both feel centered and roomy.
  const inset = Math.round(size * 0.18);
  const innerSize = size - inset * 2;
  const radius = shape === 'square' ? Math.round(size * 0.26) : size / 2;

  const Logo = src ? (
    <Image
      source={src}
      resizeMode="contain"
      style={{ width: innerSize, height: innerSize }}
      accessibilityLabel={`${key} project logo`}
    />
  ) : (
    <Text style={[styles.initial, { color: tone.color, fontSize: innerSize * 0.55 }]}>
      {tone.initial}
    </Text>
  );

  if (bare) {
    return <View style={[styles.center, { width: size, height: size }, style]}>{Logo}</View>;
  }

  return (
    <View
      style={[
        styles.center,
        {
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: tone.bg,
          borderWidth: 1.5,
          borderColor: tone.border,
        },
        style,
      ]}
    >
      {Logo}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  initial: { fontWeight: '800', letterSpacing: -0.5 },
});
