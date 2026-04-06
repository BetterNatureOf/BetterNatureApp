import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { Type } from '../../config/theme';

/**
 * BrushText — renders text in the Caveat brush font.
 * variant: 'screenTitle' | 'sectionHeader' | 'heroStat' | 'statNumber'
 */
export default function BrushText({ children, variant = 'sectionHeader', style, ...props }) {
  return (
    <Text style={[Type[variant], style]} {...props}>
      {children}
    </Text>
  );
}
