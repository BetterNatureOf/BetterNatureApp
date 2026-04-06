import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Colors } from '../../config/theme';

/**
 * BrushDivider — wavy painted SVG line instead of a flat 1px border.
 * color: defaults to light gray.
 */
export default function BrushDivider({ color = Colors.grayLight, style }) {
  return (
    <View style={[styles.container, style]}>
      <Svg width="100%" height="8" viewBox="0 0 400 8" preserveAspectRatio="none">
        <Path
          d="M0 4 Q25 0, 50 4 T100 4 T150 4 T200 4 T250 4 T300 4 T350 4 T400 4"
          stroke={color}
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 16,
    overflow: 'hidden',
  },
});
