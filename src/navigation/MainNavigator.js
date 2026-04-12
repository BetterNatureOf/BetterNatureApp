import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Colors } from '../config/theme';
import { hp } from '../config/scale';
import useAuthStore, { ROLES } from '../store/authStore';

import DashboardScreen from '../screens/main/DashboardScreen';
import ProjectsScreen from '../screens/main/ProjectsScreen';
import ImpactScreen from '../screens/main/ImpactScreen';
import LeaderboardScreen from '../screens/main/LeaderboardScreen';
import DonateScreen from '../screens/main/DonateScreen';
import ProfileScreen from '../screens/main/ProfileScreen';

import IrisScreen from '../screens/projects/IrisScreen';
import EvergreenScreen from '../screens/projects/EvergreenScreen';
import HydroScreen from '../screens/projects/HydroScreen';
import AnimalGallery from '../screens/projects/AnimalGallery';

import EventDetailScreen from '../screens/events/EventDetailScreen';

import NotificationsScreen from '../screens/other/NotificationsScreen';
import AboutScreen from '../screens/other/AboutScreen';
import SettingsScreen from '../screens/other/SettingsScreen';

import ChapterChecklist from '../screens/chapter/ChapterChecklist';

import RestDashboard from '../screens/restaurant/RestDashboard';
import ScheduleDonation from '../screens/restaurant/ScheduleDonation';
import DonationHistory from '../screens/restaurant/DonationHistory';

import AdminPanel from '../screens/admin/AdminPanel';
import ManageChapters from '../screens/admin/ManageChapters';
import ManageMembers from '../screens/admin/ManageMembers';
import ManageRestaurants from '../screens/admin/ManageRestaurants';
import GlobalHistory from '../screens/admin/GlobalHistory';
import BroadcastScreen from '../screens/admin/BroadcastScreen';
import ExportReports from '../screens/admin/ExportReports';

import PresidentDashboard from '../screens/president/PresidentDashboard';
import PresEvents from '../screens/president/PresEvents';
import PresReports from '../screens/president/PresReports';

import ExecutiveDashboard from '../screens/executive/ExecutiveDashboard';
import ExecFinance from '../screens/executive/ExecFinance';

import MetricsEditor from '../screens/admin/MetricsEditor';
import CheckInScreen from '../screens/admin/CheckInScreen';

// Wrap MetricsEditor so the route name implies the mode without the caller
// having to pass params.
function ExecMetricsScreen(props) {
  return (
    <MetricsEditor
      {...props}
      route={{ ...props.route, params: { ...(props.route?.params || {}), mode: 'org' } }}
    />
  );
}
function PresMetricsScreen(props) {
  return (
    <MetricsEditor
      {...props}
      route={{ ...props.route, params: { ...(props.route?.params || {}), mode: 'chapter' } }}
    />
  );
}

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

function TabIcon({ label, focused }) {
  return (
    <View style={styles.tabIcon}>
      <View
        style={[
          styles.dot,
          { backgroundColor: focused ? Colors.pink : 'transparent' },
        ]}
      />
      <Text
        numberOfLines={1}
        allowFontScaling={false}
        style={[
          styles.tabLabel,
          { color: focused ? Colors.pink : Colors.grayMid },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

// Choose which dashboard the "Manage" tab opens to based on role.
function ManageTab(props) {
  const role = useAuthStore((s) => s.role);
  if (role === ROLES.EXECUTIVE) return <ExecutiveDashboard {...props} />;
  if (role === ROLES.PRESIDENT) return <PresidentDashboard {...props} />;
  // Fallback — shouldn't render because the tab is hidden for plain members.
  return <DashboardScreen {...props} />;
}

function MainTabs() {
  const role = useAuthStore((s) => s.role);
  const showManage = role === ROLES.PRESIDENT || role === ROLES.EXECUTIVE;
  const manageLabel = role === ROLES.EXECUTIVE ? 'Org' : 'Chapter';

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarShowLabel: false,
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon label="Home" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Projects"
        component={ProjectsScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon label="Projects" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Impact"
        component={ImpactScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon label="Impact" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Donate"
        component={DonateScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon label="Donate" focused={focused} />,
        }}
      />
      {showManage && (
        <Tab.Screen
          name="Manage"
          component={ManageTab}
          options={{
            tabBarIcon: ({ focused }) => (
              <TabIcon label={manageLabel} focused={focused} />
            ),
          }}
        />
      )}
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon label="Profile" focused={focused} />,
        }}
      />
    </Tab.Navigator>
  );
}

// Dispatches to the correct project screen based on the `project` param.
function ProjectDetail({ route, navigation }) {
  const key = (route.params?.project || '').toString().toLowerCase();
  if (key === 'evergreen') return <EvergreenScreen navigation={navigation} route={route} />;
  if (key === 'hydro') return <HydroScreen navigation={navigation} route={route} />;
  return <IrisScreen navigation={navigation} route={route} />;
}

export default function MainNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MainTabs" component={MainTabs} />
      <Stack.Screen name="Leaderboard" component={LeaderboardScreen} />
      <Stack.Screen name="ProjectDetail" component={ProjectDetail} />
      <Stack.Screen name="Iris" component={IrisScreen} />
      <Stack.Screen name="Evergreen" component={EvergreenScreen} />
      <Stack.Screen name="Hydro" component={HydroScreen} />
      <Stack.Screen name="AnimalGallery" component={AnimalGallery} />
      <Stack.Screen name="EventDetail" component={EventDetailScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="About" component={AboutScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="ChapterChecklist" component={ChapterChecklist} />
      <Stack.Screen name="RestDashboard" component={RestDashboard} />
      <Stack.Screen name="ScheduleDonation" component={ScheduleDonation} />
      <Stack.Screen name="DonationHistory" component={DonationHistory} />

      {/* Admin / shared management routes — registered for everyone but only
          reachable from the Manage tab when the role allows it. */}
      <Stack.Screen name="AdminPanel" component={AdminPanel} />
      <Stack.Screen name="ManageChapters" component={ManageChapters} />
      <Stack.Screen name="ManageMembers" component={ManageMembers} />
      <Stack.Screen name="ManageRestaurants" component={ManageRestaurants} />
      <Stack.Screen name="GlobalHistory" component={GlobalHistory} />
      <Stack.Screen name="Broadcast" component={BroadcastScreen} />
      <Stack.Screen name="ExportReports" component={ExportReports} />

      {/* President-flavored aliases so PresidentDashboard's existing
          navigation.navigate('PresEvents') etc. keep working. */}
      <Stack.Screen name="PresEvents" component={PresEvents} />
      <Stack.Screen name="PresReports" component={PresReports} />
      <Stack.Screen name="PresMembers" component={ManageMembers} />
      <Stack.Screen name="PresBroadcast" component={BroadcastScreen} />

      {/* Executive-flavored alias for the finance screen. */}
      <Stack.Screen name="ExecFinance" component={ExecFinance} />

      {/* Metrics editor — same screen, different scope per role. */}
      <Stack.Screen name="ExecMetrics" component={ExecMetricsScreen} />
      <Stack.Screen name="PresMetrics" component={PresMetricsScreen} />

      {/* Check-in — pres/exec verify volunteer attendance */}
      <Stack.Screen name="CheckIn" component={CheckInScreen} />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.white,
    borderTopWidth: 0,
    height: Platform.OS === 'ios' ? hp(85) : hp(70),
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? hp(20) : 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 8,
  },
  tabIcon: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 60,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginBottom: 4,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
});
