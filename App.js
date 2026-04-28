import 'react-native-url-polyfill/auto';
import React, { useState, useEffect, useCallback } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Text, TextInput, StyleSheet, Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import * as Font from 'expo-font';

import AuthNavigator from './src/navigation/AuthNavigator';
import MainNavigator from './src/navigation/MainNavigator';
import RestaurantNavigator from './src/navigation/RestaurantNavigator';
import LoadingScreen from './src/screens/auth/LoadingScreen';
import CompleteProfile from './src/screens/auth/CompleteProfile';
import useAuthStore, { ROLES } from './src/store/authStore';
import { fp } from './src/config/scale';

// Lock font scaling across the whole app so layouts stay consistent
// regardless of the user's OS accessibility text-size setting.
if (Text.defaultProps == null) Text.defaultProps = {};
Text.defaultProps.allowFontScaling = false;
Text.defaultProps.maxFontSizeMultiplier = 1.2;
if (TextInput.defaultProps == null) TextInput.defaultProps = {};
TextInput.defaultProps.allowFontScaling = false;
TextInput.defaultProps.maxFontSizeMultiplier = 1.2;

// Responsive font scaling — monkey-patch Text.render so every <Text> in the
// app automatically has its fontSize run through fp() based on device width.
// This lets us keep hard-coded fontSize values throughout the codebase while
// still rendering correctly on small phones and large phones/tablets.
//
// Skipped on web — react-native-web's <Text> uses a different render path
// and the browser already handles font scaling via CSS.
if (Platform.OS !== 'web') {
  (function applyResponsiveText() {
    const origRender = Text.render;
    if (!origRender || Text.__responsivePatched) return;
    Text.__responsivePatched = true;

    function scaleStyle(style) {
      if (style == null || style === false) return style;
      if (Array.isArray(style)) return style.map(scaleStyle);
      if (typeof style === 'number') {
        const flat = StyleSheet.flatten(style);
        if (flat && typeof flat.fontSize === 'number') {
          return { ...flat, fontSize: fp(flat.fontSize) };
        }
        return style;
      }
      if (typeof style === 'object' && typeof style.fontSize === 'number') {
        return { ...style, fontSize: fp(style.fontSize) };
      }
      return style;
    }

    Text.render = function patchedRender(...args) {
      const el = origRender.apply(this, args);
      if (!el || !el.props) return el;
      return React.cloneElement(el, { style: scaleStyle(el.props.style) });
    };
  })();
}

// Restaurants get their own dedicated portal (no member features).
// Members, chapter presidents, and executives all share MainNavigator —
// presidents/execs see an extra "Manage" tab on top of every member feature.
function rootForRole(role) {
  if (role === ROLES.RESTAURANT) return <RestaurantNavigator />;
  return <MainNavigator />;
}

export default function App() {
  const [fontsLoaded, setFontsLoaded] = useState(false);
  const { isAuthenticated, isLoading, setLoading, role, user } = useAuthStore();
  // Google / Apple sign-in lands here without ever filling out the email
  // signup form, so we route them through CompleteProfile first.
  const needsProfile = isAuthenticated && user && user.profile_complete === false;

  useEffect(() => {
    async function loadFonts() {
      try {
        await Font.loadAsync({
          'Caveat-Bold': require('./src/assets/fonts/Caveat-Bold.ttf'),
        });
      } catch (e) {
        // Font loading failed — fall back to system font
        console.warn('Caveat-Bold font not found, using system font');
      }
      setFontsLoaded(true);
      setLoading(false);
    }
    loadFonts();
  }, []);

  if (!fontsLoaded || isLoading) {
    return <LoadingScreen />;
  }

  return (
    <>
      <StatusBar style="dark" />
      <NavigationContainer>
        {!isAuthenticated
          ? <AuthNavigator />
          : needsProfile
          ? <CompleteProfile />
          : rootForRole(role)}
      </NavigationContainer>
    </>
  );
}
