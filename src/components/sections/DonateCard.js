import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Radius, Type, Shadows } from '../../config/theme';
import BrushText from '../ui/BrushText';

export default function DonateCard({ onPress }) {
  return (
    <TouchableOpacity activeOpacity={0.88} onPress={onPress}>
      <LinearGradient
        colors={Colors.gradient.sunset}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        <View style={styles.decorCircle} />
        <BrushText variant="sectionHeader" style={styles.title}>
          Make a Difference Today
        </BrushText>
        <Text style={styles.body}>
          Your donation helps us rescue food, protect wildlife, and provide clean water.
        </Text>
        <View style={styles.button}>
          <Text style={styles.buttonText}>Donate Now</Text>
          <Text style={styles.buttonArrow}>{'\u2192'}</Text>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 24,
    marginTop: 24,
    marginBottom: 32,
    borderRadius: Radius.xl,
    padding: 24,
    overflow: 'hidden',
    ...Shadows.glow(Colors.pink),
  },
  decorCircle: {
    position: 'absolute',
    top: -30,
    right: -30,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  title: {
    color: Colors.white,
    fontSize: 24,
  },
  body: {
    color: Colors.white,
    opacity: 0.9,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
    marginBottom: 18,
  },
  button: {
    backgroundColor: Colors.white,
    borderRadius: Radius.pill,
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonText: {
    color: Colors.pink,
    fontWeight: '700',
    fontSize: 15,
    letterSpacing: 0.3,
  },
  buttonArrow: {
    color: Colors.pink,
    fontSize: 16,
    fontWeight: '600',
  },
});
