import React from 'react';
import { TouchableOpacity, View, StyleSheet } from 'react-native';
import { Colors } from '../../config/theme';

/**
 * Toggle — green/gray switch, 52x30px.
 */
export default function Toggle({ value, onToggle, style }) {
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onToggle}
      style={[
        styles.track,
        { backgroundColor: value ? Colors.green : Colors.grayLight },
        style,
      ]}
    >
      <View
        style={[
          styles.thumb,
          { transform: [{ translateX: value ? 22 : 0 }] },
        ]}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  track: {
    width: 52,
    height: 30,
    borderRadius: 15,
    padding: 4,
    justifyContent: 'center',
  },
  thumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
});
