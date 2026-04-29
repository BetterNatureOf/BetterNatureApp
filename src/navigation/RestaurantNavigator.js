import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import RestDashboard from '../screens/restaurant/RestDashboard';
import ScheduleDonation from '../screens/restaurant/ScheduleDonation';
import DonationHistory from '../screens/restaurant/DonationHistory';
import TaxReceiptsScreen from '../screens/restaurant/TaxReceiptsScreen';
import SettingsScreen from '../screens/other/SettingsScreen';
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
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
    </Stack.Navigator>
  );
}
