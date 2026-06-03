import React from 'react';
import { View, StyleSheet } from 'react-native';
import useBreakpoint from '../../hooks/useBreakpoint';

/**
 * ResponsiveContainer — centers content with a max width on tablet/desktop so
 * dashboards don't stretch into ugly full-width text on iPad and laptops.
 *
 * On phones it's a no-op pass-through. On wider screens it caps the width at
 * `maxWidth` (default 880) and centers the column horizontally.
 */
export default function ResponsiveContainer({ children, maxWidth = 880, style }) {
  const { isPhone } = useBreakpoint();

  if (isPhone) {
    return <View style={[styles.phone, style]}>{children}</View>;
  }

  return (
    <View style={[styles.wide, { maxWidth }, style]}>{children}</View>
  );
}

const styles = StyleSheet.create({
  phone: { width: '100%' },
  // marginHorizontal:'auto' centers the block regardless of whether
  // the parent uses flex stretch, block layout, or anything else.
  // (alignSelf:'center' was getting flattened to no-op inside our
  // Screen wrapper's flex column on web.)
  wide: {
    width: '100%',
    alignSelf: 'center',
    marginLeft: 'auto',
    marginRight: 'auto',
  },
});
