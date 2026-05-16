// Press feedback for tappable cards. Subtle scale + opacity on press,
// spring back on release. The motion is intentionally restrained —
// 0.97 scale, ~120ms — so it reads as confirmation, not bounce.
//
// Why a wrapper instead of plain TouchableOpacity:
//  - TouchableOpacity only dims opacity; no haptic of "the surface moved"
//  - Pressable lets us drive Reanimated values from press state directly
//  - Spring physics on release feels alive in a way easing never does
import React from 'react';
import { Pressable } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';

export default function AnimatedPressable({
  onPress,
  onLongPress,
  style,
  children,
  disabled,
  scaleTo = 0.97,
  ...rest
}) {
  const pressed = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * (1 - scaleTo) }],
    opacity: 1 - pressed.value * 0.1,
  }));

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      onPressIn={() => { pressed.value = withTiming(1, { duration: 80 }); }}
      onPressOut={() => { pressed.value = withSpring(0, { damping: 14, stiffness: 220 }); }}
      {...rest}
    >
      <Animated.View style={[style, animatedStyle]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}
