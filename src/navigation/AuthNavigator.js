import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import WelcomeScreen from '../screens/auth/WelcomeScreen';
import LoginScreen from '../screens/auth/LoginScreen';
import SignupStep1 from '../screens/auth/SignupStep1';
import SignupStep2 from '../screens/auth/SignupStep2';
import SignupStep3 from '../screens/auth/SignupStep3';
import StartChapter from '../screens/chapter/StartChapter';
import RestaurantSignup from '../screens/auth/RestaurantSignup';

// Restaurants self-signup through RestaurantSignup. The doc lands in
// /restaurants with status:'pending' and the account is gated behind
// an exec approval (RestaurantApprovalGate) so nothing they post
// reaches volunteers until reviewed. Presidents and executives still
// sign in with credentials assigned after promotion in-app.

const Stack = createStackNavigator();

export default function AuthNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="SignupStep1" component={SignupStep1} />
      <Stack.Screen name="SignupStep2" component={SignupStep2} />
      <Stack.Screen name="SignupStep3" component={SignupStep3} />
      <Stack.Screen name="StartChapter" component={StartChapter} />
      <Stack.Screen name="RestaurantSignup" component={RestaurantSignup} />
    </Stack.Navigator>
  );
}
