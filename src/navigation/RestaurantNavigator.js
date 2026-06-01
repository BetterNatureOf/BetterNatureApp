import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import RestDashboard from '../screens/restaurant/RestDashboard';
import ScheduleDonation from '../screens/restaurant/ScheduleDonation';
import DonationHistory from '../screens/restaurant/DonationHistory';
import TaxReceiptsScreen from '../screens/restaurant/TaxReceiptsScreen';
import SettingsScreen from '../screens/other/SettingsScreen';
import EditProfile from '../screens/other/EditProfile';
import ChangePassword from '../screens/other/ChangePassword';
import ConnectedAccounts from '../screens/other/ConnectedAccounts';
import VerifyIdScreen from '../screens/other/VerifyIdScreen';
import RestaurantOnboarding from '../screens/restaurant/RestaurantOnboarding';
import NotificationsScreen from '../screens/other/NotificationsScreen';

const Stack = createStackNavigator();

export default function RestaurantNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="RestDashboard" component={RestDashboard} />
      <Stack.Screen name="ScheduleDonation" component={ScheduleDonation} />
      <Stack.Screen name="DonationHistory" component={DonationHistory} />
      <Stack.Screen name="TaxReceipts" component={TaxReceiptsScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="EditProfile" component={EditProfile} />
      <Stack.Screen name="ChangePassword" component={ChangePassword} />
      <Stack.Screen name="ConnectedAccounts" component={ConnectedAccounts} />
      <Stack.Screen name="VerifyId" component={VerifyIdScreen} />
      <Stack.Screen name="RestaurantOnboarding" component={RestaurantOnboarding} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
    </Stack.Navigator>
  );
}
