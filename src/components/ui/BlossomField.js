// Native counterpart of BlossomField.web.js: a light scatter of slowly
// falling cherry-blossom petals and leaves. Decorative only — hidden from
// assistive tech, ignores touches, and holds still for "Reduce motion".
import React, { useEffect, useMemo, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

const PETAL = 'M6 12 C11 8 10 1 7 2 L6 4 L5 2 C2 1 1 8 6 12 Z';
const LEAF = 'M6 0 Q12 6 6 12 Q0 6 6 0 Z';
const COLORS = ['#F9C9D4', '#F6B3C2', '#F28AA9', '#FBE3E9', '#9FD0B4'];

function Particle({ seed, height, reduce }) {
  const fall = useRef(new Animated.Value(seed.start)).current;
  useEffect(() => {
    if (reduce) return undefined;
    let alive = true;
    const run = (from) => {
      fall.setValue(from);
      Animated.timing(fall, {
        toValue: 1, duration: seed.duration * (1 - from), easing: Easing.linear, useNativeDriver: true,
      }).start(({ finished }) => { if (finished && alive) run(0); });
    };
    run(seed.start);
    return () => { alive = false; fall.stopAnimation(); };
  }, [fall, reduce, seed]);
  const translateY = fall.interpolate({ inputRange: [0, 1], outputRange: [-24, height + 24] });
  const rotate = fall.interpolate({ inputRange: [0, 1], outputRange: [`${seed.rot}deg`, `${seed.rot + 220}deg`] });
  const translateX = fall.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, seed.sway, 0] });
  return (
    <Animated.View style={[styles.particle, { left: seed.x, opacity: seed.alpha,
      transform: [{ translateY }, { translateX }, { rotate }, { scale: seed.scale }] }]}>
      <Svg width={12} height={12} viewBox="0 0 12 12">
        <Path d={seed.leaf ? LEAF : PETAL} fill={seed.color} />
      </Svg>
    </Animated.View>
  );
}

export default function BlossomField({ density = 18, width = 400, height = 400, style }) {
  const [reduce, setReduce] = React.useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled?.().then(setReduce).catch(() => {});
  }, []);
  const seeds = useMemo(() => Array.from({ length: density }, (_, i) => {
    const leaf = i % 6 === 0;
    return {
      x: Math.random() * width, start: Math.random(), duration: 9000 + Math.random() * 7000,
      sway: (Math.random() - 0.5) * 40, rot: Math.random() * 360, scale: 0.8 + Math.random() * 0.8,
      alpha: 0.55 + Math.random() * 0.4, leaf, color: leaf ? COLORS[4] : COLORS[i % 4],
    };
  }), [density, width]);
  return (
    <View style={[StyleSheet.absoluteFill, style]} pointerEvents="none"
      accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {seeds.map((seed, i) => <Particle key={i} seed={seed} height={height} reduce={reduce} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  particle: { position: 'absolute', top: 0 },
});
