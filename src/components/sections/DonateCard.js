import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors, Radius, Type } from '../../config/theme';
import BrushText from '../ui/BrushText';

export default function DonateCard({ onPress }) {
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={styles.card}>
      <BrushText variant="sectionHeader" style={styles.title}>
        Make a Difference Today
      </BrushText>
      <Text style={styles.body}>
        Your donation helps us rescue food, protect wildlife, and provide clean water.
      </Text>
      <View style={styles.button}>
        <Text style={styles.buttonText}>Donate Now</Text>
      </View>
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
    backgroundColor: Colors.pink,
    shadowColor: Colors.pink,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  title: {
    color: Colors.white,
    fontSize: 22,
  },
  body: {
    color: Colors.white,
    opacity: 0.9,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
    marginBottom: 16,
  },
  button: {
    backgroundColor: Colors.white,
    borderRadius: Radius.pill,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: Colors.pink,
    fontWeight: '700',
    fontSize: 15,
  },
});
