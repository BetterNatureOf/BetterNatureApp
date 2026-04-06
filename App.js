import React, { useState, useEffect, useCallback } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import * as Font from 'expo-font';

import AuthNavigator from './src/navigation/AuthNavigator';
import MainNavigator from './src/navigation/MainNavigator';
import LoadingScreen from './src/screens/auth/LoadingScreen';
import useAuthStore from './src/store/authStore';

export default function App() {
  const [fontsLoaded, setFontsLoaded] = useState(false);
  const { isAuthenticated, isLoading, setLoading } = useAuthStore();

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
        {isAuthenticated ? <MainNavigator /> : <AuthNavigator />}
      </NavigationContainer>
    </>
  );
}
