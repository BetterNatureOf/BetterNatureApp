import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Colors } from '../../config/theme';
import useAuthStore from '../../store/authStore';
import useNotifStore from '../../store/notifStore';
import DashboardHeader from '../../components/sections/DashboardHeader';
import ProjectCards from '../../components/sections/ProjectCards';
import UpcomingEvents from '../../components/sections/UpcomingEvents';
import DonateCard from '../../components/sections/DonateCard';
import MemberOfMonth from '../../components/sections/MemberOfMonth';
import BrushDivider from '../../components/ui/BrushDivider';
import StatCard from '../../components/ui/StatCard';
import BrushText from '../../components/ui/BrushText';
import useEvents from '../../hooks/useEvents';

export default function DashboardScreen({ navigation }) {
  const user = useAuthStore((s) => s.user);
  const unreadCount = useNotifStore((s) => s.unreadCount);
  const { events } = useEvents();

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
    marginTop: 20,
    gap: 10,
  },
  statItem: {
    flex: 1,
  },
});
