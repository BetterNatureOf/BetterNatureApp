import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function registerForPushNotifications() {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const token = (await Notifications.getExpoPushTokenAsync()).data;
  return token;
}

export async function scheduleEventReminders(event) {
  const eventDate = new Date(`${event.date}T${event.time || '09:00'}`);
  const reminders = [
    { label: '1 week before', ms: 7 * 24 * 60 * 60 * 1000 },
    { label: '3 days before', ms: 3 * 24 * 60 * 60 * 1000 },
    { label: '24 hours before', ms: 24 * 60 * 60 * 1000 },
    { label: '1 hour before', ms: 60 * 60 * 1000 },
  ];

  for (const reminder of reminders) {
    const triggerDate = new Date(eventDate.getTime() - reminder.ms);
    if (triggerDate > new Date()) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `Upcoming: ${event.title}`,
          body: `${reminder.label} — ${event.location || 'See app for details'}`,
          data: { eventId: event.id, type: 'event_reminder' },
        },
        trigger: { date: triggerDate },
      });
    }
  }
}

export async function sendPickupAlert(pickup) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'New Pickup Available!',
      body: `${pickup.restaurant_name} has ${pickup.items} ready for rescue`,
      data: { pickupId: pickup.id, type: 'pickup' },
    },
    trigger: null, // immediate
  });
}

export function addNotificationListener(handler) {
  const subscription = Notifications.addNotificationReceivedListener(handler);
  return subscription;
}

export function addResponseListener(handler) {
  const subscription =
    Notifications.addNotificationResponseReceivedListener(handler);
  return subscription;
}
