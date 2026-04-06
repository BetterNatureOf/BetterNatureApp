import { useEffect, useCallback } from 'react';
import useEventStore from '../store/eventStore';
import useAuthStore from '../store/authStore';
import { fetchEvents, signUpForEvent, cancelEventSignup, getUserSignups } from '../services/database';

export default function useEvents() {
  const { events, loading, setEvents, setLoading, addSignup, removeSignup } = useEventStore();
  const user = useAuthStore((s) => s.user);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchEvents(user?.chapter_id);
      setEvents(data);
    } catch (e) {
      console.error('Failed to load events:', e);
    } finally {
      setLoading(false);
    }
  }, [user?.chapter_id]);

  const joinEvent = useCallback(
    async (eventId) => {
      if (!user?.id) return;
      await signUpForEvent(eventId, user.id);
      addSignup(eventId);
    },
    [user?.id]
  );

  const leaveEvent = useCallback(
    async (eventId) => {
      if (!user?.id) return;
      await cancelEventSignup(eventId, user.id);
      removeSignup(eventId);
    },
    [user?.id]
  );

  useEffect(() => {
    if (user) loadEvents();
  }, [user, loadEvents]);

  return { events, loading, loadEvents, joinEvent, leaveEvent };
}
