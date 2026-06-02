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

// Brand tones used by the frame. Tinted fill + same-color ring. The
// logo image is layered with mix-blend-mode: multiply so any white in
// the PNG dissolves into the tinted background — no need to re-export
// the source files to add transparency.
const TONE = {
  iris:      { color: Colors.pink,  bg: '#FFE5EE', ring: 'rgba(255,77,141,0.55)', initial: 'I' },
  hydro:     { color: Colors.sky,   bg: '#E1EDFA', ring: 'rgba(30,136,229,0.50)', initial: 'H' },
  evergreen: { color: Colors.green, bg: '#DFF1E2', ring: 'rgba(46,125,50,0.55)',  initial: 'E' },
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

  // Inner image fills ~92% of the frame so the logo dominates and the
  // ring reads as a glow around it, not a chunky border with a tile.
  const inset = Math.round(size * 0.04);
  const innerSize = size - inset * 2;
  const radius = shape === 'square' ? Math.round(size * 0.26) : size / 2;

  // The bundled PNGs now have real transparent backgrounds (cleaned
  // by scripts/strip-white-bg.py at build time), so no blend-mode hack
  // is needed — the logo sits cleanly on whatever color is behind it.
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

  // Solid brand-tinted fill + matching ring. The multiply-blended logo
  // sits on top so the PNG's white background dissolves into the fill.
  return (
    <View
      style={[
        styles.center,
        {
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: tone.bg,
          borderWidth: Math.max(2, size * 0.035),
          borderColor: tone.ring,
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
