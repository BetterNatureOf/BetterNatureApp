import React from 'react';
import { ScrollView, StyleSheet, View, Alert } from 'react-native';
import { Colors } from '../../config/theme';
import useAuthStore from '../../store/authStore';
import useNotifStore from '../../store/notifStore';
import DashboardHeader from '../../components/sections/DashboardHeader';
import ProjectCards from '../../components/sections/ProjectCards';
import UpcomingEvents from '../../components/sections/UpcomingEvents';
import DonateCard from '../../components/sections/DonateCard';
import MemberOfMonth from '../../components/sections/MemberOfMonth';
import MyPickups from '../../components/sections/MyPickups';
import BrushDivider from '../../components/ui/BrushDivider';
import StatCard from '../../components/ui/StatCard';
import useEvents from '../../hooks/useEvents';
import usePickups from '../../hooks/usePickups';

export default function DashboardScreen({ navigation }) {
  const user = useAuthStore((s) => s.user);
  const unreadCount = useNotifStore((s) => s.unreadCount);
  const { events } = useEvents();
  const { pickups, claim } = usePickups();

  function handleClaimPickup(pickup) {
    Alert.alert(
      'Claim Pickup',
      `Claim the pickup from ${pickup.restaurant_name} on ${pickup.scheduled_date} at ${pickup.scheduled_time}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Claim It',
          onPress: () => claim(pickup.id),
        },
      ]
    );
  }

  return (
    <View style={styles.container}>
      <DashboardHeader
        user={user}
        chapterName={user?.chapter?.name}
        unreadCount={unreadCount}
        onNotifPress={() => navigation.navigate('Notifications')}
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Quick Stats */}
        <View style={styles.statsRow}>
          <StatCard
            number={user?.events_attended || 0}
            label="Events"
            color={Colors.green}
            style={styles.statItem}
          />
          <StatCard
            number={user?.meals_rescued || 0}
            label="Meals Rescued"
            color={Colors.sage}
            style={styles.statItem}
          />
          <StatCard
            number={`${user?.hours_logged || 0}h`}
            label="Hours"
            color={Colors.pink}
            style={styles.statItem}
          />
        </View>

        {/* Active Pickups — shows assigned & available pickups */}
        <MyPickups
          pickups={pickups}
          userId={user?.id}
          onPickupPress={(pickup) => {
            // Could navigate to pickup detail in future
          }}
          onClaimPress={handleClaimPickup}
        />

        <BrushDivider />

        <ProjectCards
          onPress={(project) => navigation.navigate('ProjectDetail', { project })}
        />

        <BrushDivider />

        <UpcomingEvents
          events={events}
          onEventPress={(event) => navigation.navigate('EventDetail', { event })}
        />

        <MemberOfMonth member={null} />

        <DonateCard onPress={() => navigation.navigate('Donate')} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingBottom: 32,
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    marginTop: 22,
    gap: 10,
  },
  statItem: {
    flex: 1,
  },
});
