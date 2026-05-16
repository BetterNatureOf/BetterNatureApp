// Mount animation: fade + slight rise. Used to stagger lists and section
// reveals so the page assembles itself instead of slamming into place.
//
// Pass `delay` to stagger siblings (e.g. 60ms increments). Keep the
// translate tiny — 8–12px — so it reads as "settling in," not entering.
import React, { useEffect } from 'react';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withDelay, Easing } from 'react-native-reanimated';

export default function FadeInView({
  children,
  delay = 0,
  duration = 360,
  translateY = 8,
  style,
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withTiming(1, { duration, easing: Easing.out(Easing.cubic) })
    );
  }, [delay, duration, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * translateY }],
  }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}
