import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, ActivityIndicator, ImageBackground, Animated, Dimensions } from 'react-native';
import { Colors } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';

const { width, height } = Dimensions.get('window');

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
      {/* Background illustration — uses the provided watercolor nature scene */}
      <ImageBackground
        source={require('../../assets/images/loading-bg.png')}
        style={styles.background}
        resizeMode="cover"
      >
        {/* Overlay gradient for text readability */}
        <View style={styles.overlay} />

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
            Better Nature
          </BrushText>
          <BrushText variant="sectionHeader" style={styles.tagline}>
            Rescue. Protect. Sustain.
          </BrushText>
        </Animated.View>

        {/* Spinner at bottom */}
        <View style={styles.spinnerWrap}>
          <ActivityIndicator size="large" color={Colors.white} />
        </View>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  background: {
    flex: 1,
    width,
    height,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(47, 93, 80, 0.15)',
  },
  titleWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 80,
  },
  title: {
    color: Colors.green,
    fontSize: 48,
    textShadowColor: 'rgba(255,255,255,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  tagline: {
    color: Colors.pink,
    marginTop: 4,
    fontSize: 18,
    textShadowColor: 'rgba(255,255,255,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  spinnerWrap: {
    paddingBottom: 80,
    alignItems: 'center',
  },
});
