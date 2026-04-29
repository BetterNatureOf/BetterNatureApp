import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, ActivityIndicator, Animated } from 'react-native';
import { Colors } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';

export default function LoadingScreen() {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 1200,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 1200,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <View style={styles.container}>
      {/* Logo & Title */}
      <Animated.View
        style={[
          styles.titleWrap,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        <BrushText variant="heroStat" style={styles.title}>
          BetterNature
        </BrushText>
        <BrushText variant="sectionHeader" style={styles.tagline}>
          Rescue. Protect. Sustain.
        </BrushText>
      </Animated.View>

      {/* Spinner at bottom */}
      <View style={styles.spinnerWrap}>
        <ActivityIndicator size="large" color={Colors.pink} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
  },
  titleWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  spinnerWrap: {
    paddingBottom: 80,
    alignItems: 'center',
  },
});
