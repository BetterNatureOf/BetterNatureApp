// Shared screen wrapper that guarantees scrolling on web.
//
// react-native-web's ScrollView wraps its content in nested divs whose
// height behavior is brittle: in our stack-navigator setup it routinely
// fails to bound the inner div to the viewport, so content overflows
// the page rather than scrolling inside the screen. Every screen that
// uses this component renders a raw <div> with `height: 100vh` +
// `overflow-y: auto` on web, and a normal ScrollView on native.
//
// Usage:
//   <Screen contentStyle={styles.content} bg={Colors.cream}>
//     ...children...
//   </Screen>
import React from 'react';
import { ScrollView, Platform, StyleSheet } from 'react-native';
import { Colors } from '../../config/theme';

export default function Screen({
  children,
  bg = Colors.cream,
  contentStyle,
  // Native-only props forwarded to ScrollView
  refreshControl,
  keyboardShouldPersistTaps,
  ...rest
}) {
  if (Platform.OS === 'web') {
    // Flatten contentStyle so React.createElement gets a plain object.
    const flat = StyleSheet.flatten(contentStyle) || {};
    return React.createElement(
      'div',
      {
        style: {
          height: '100vh',
          width: '100%',
          overflowY: 'auto',
          overflowX: 'hidden',
          WebkitOverflowScrolling: 'touch',
          backgroundColor: bg,
          boxSizing: 'border-box',
        },
      },
      // Inner uses flex column so children using `alignSelf: 'center'`
      // (notably <ResponsiveContainer>) get centered horizontally.
      React.createElement(
        'div',
        {
          style: {
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'stretch',
            minHeight: '100%',
            boxSizing: 'border-box',
            ...flat,
          },
        },
        children
      )
    );
  }
  return (
    <ScrollView
      style={[{ flex: 1, backgroundColor: bg }, rest.style]}
      contentContainerStyle={contentStyle}
      refreshControl={refreshControl}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
    >
      {children}
    </ScrollView>
  );
}
