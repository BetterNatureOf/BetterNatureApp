// Project logo registry. One file resolves every project image so
// renaming an asset or adding a project is a single-line change.
//
// Usage:
//   <ProjectLogo project="iris" size={56} />
//   <ProjectLogo project="hydro" size={32} />
//
// Behavior:
//   • Renders the bundled PNG when the file exists at /src/assets/projects/{key}.png
//   • If the require() fails at bundle time (because the asset isn't
//     dropped in yet), falls back to a tinted-circle initial so the UI
//     keeps shipping. Drop the file in → next reload, the real logo appears.
import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { Colors } from '../../config/theme';

// We resolve each require() inside a try/catch wrapper at module load so
// a missing file doesn't crash the whole bundle.
function tryRequire(loader) {
  try { return loader(); } catch { return null; }
}

const SOURCES = {
  iris:      tryRequire(() => require('../../assets/projects/iris.png')),
  hydro:     tryRequire(() => require('../../assets/projects/hydro.png')),
  evergreen: tryRequire(() => require('../../assets/projects/evergreen.png')),
};

const FALLBACK = {
  iris:      { color: Colors.pink,  bg: '#FFE5EE', initial: 'I' },
  hydro:     { color: Colors.sky,   bg: '#E1EDFA', initial: 'H' },
  evergreen: { color: Colors.green, bg: '#DFF1E2', initial: 'E' },
};

export default function ProjectLogo({ project, size = 48, style }) {
  const key = String(project || '').toLowerCase();
  const src = SOURCES[key];
  const fb  = FALLBACK[key] || FALLBACK.iris;

  if (src) {
    return (
      <Image
        source={src}
        resizeMode="contain"
        style={[{ width: size, height: size }, style]}
        accessibilityLabel={`${key} project logo`}
      />
    );
  }
  // Initial-circle fallback so a missing asset never blocks ship.
  return (
    <View
      style={[
        styles.fallback,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: fb.bg },
        style,
      ]}
    >
      <Text style={[styles.initial, { color: fb.color, fontSize: size * 0.46 }]}>{fb.initial}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center' },
  initial: { fontWeight: '800', letterSpacing: -0.5 },
});
