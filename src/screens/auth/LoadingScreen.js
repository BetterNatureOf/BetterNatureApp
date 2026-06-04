import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, ActivityIndicator, Animated, Platform } from 'react-native';
import { Colors } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';

export default function LoadingScreen() {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 1200, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.centerStack,
          { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
        ]}
      >
        <BrushText variant="heroStat" style={styles.title}>
          BetterNature
        </BrushText>
        <BrushText variant="sectionHeader" style={styles.tagline}>
          Rescue. Protect. Sustain.
        </BrushText>
        <ActivityIndicator size="large" color={Colors.pink} style={styles.spinner} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? { height: '100vh', minHeight: '100vh' } : null),
  },
  centerStack: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: Colors.green,
    fontSize: 48,
  },
  tagline: {
    color: Colors.pink,
    marginTop: 4,
    fontSize: 18,
  },
  spinner: {
    marginTop: 32,
  },
});
