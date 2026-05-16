import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { Type } from '../../config/theme';

/**
 * Display-text component. Named "BrushText" for historical reasons (the
 * site used to render these in a brush font); now it just maps a variant
 * key onto the editorial sans/serif scale defined in typography.js.
 * variant: 'screenTitle' | 'sectionHeader' | 'heroStat' | 'statNumber'
 */
export default function BrushText({ children, variant = 'sectionHeader', style, ...props }) {
  return (
    <Text style={[Type[variant], style]} {...props}>
      {children}
    </Text>
  );
}
