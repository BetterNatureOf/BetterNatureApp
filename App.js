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
import useAuth from './src/hooks/useAuth';
import linking from './src/navigation/linking';
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

// Clear any stale localStorage state from the older state-persistence
// approach so it can't confuse anything if it's still hanging around.
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  try { window.localStorage.removeItem('BN_NAV_STATE_v1'); } catch {}
}

export default function App() {
  const [fontsLoaded, setFontsLoaded] = useState(false);
  // Subscribe to Firebase auth state so the user is rehydrated on every
  // reload. Without this, refreshing the page always boots back to the
  // login screen even though Firebase still has a valid session.
  useAuth();
  const { isAuthenticated, isLoading, setLoading, role, user } = useAuthStore();
  // Google / Apple sign-in lands here without ever filling out the email
  // signup form, so we route them through CompleteProfile first.
  const needsProfile = isAuthenticated && user && user.profile_complete === false;

  useEffect(() => {
    async function loadFonts() {
      // We dropped the custom Caveat font in favor of editorial system
      // sans/serif. Nothing to load — go straight to "ready".
      setFontsLoaded(true);
      // Don't flip the global isLoading here — useAuth() owns that flag
      // and will clear it once the Firebase auth listener resolves. Flipping
      // it early caused NavigationContainer to mount under AuthNavigator
      // before Firebase rehydrated the session, which made the saved
      // navigation state get discarded on every reload.
    }
    loadFonts();
  }, []);

  if (!fontsLoaded || isLoading) {
    return <LoadingScreen />;
  }
  return (
    <>
      <StatusBar style="dark" />
      <NavigationContainer
        linking={linking}
        fallback={<LoadingScreen />}
      >
        {!isAuthenticated
          ? <AuthNavigator />
          : needsProfile
          ? <CompleteProfile />
          : rootForRole(role)}
      </NavigationContainer>
    </>
  );
}
