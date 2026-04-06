import { create } from 'zustand';

const useEventStore = create((set) => ({
  events: [],
  upcomingEvents: [],
  loading: false,

  setEvents: (events) => set({ events }),
  setUpcomingEvents: (upcomingEvents) => set({ upcomingEvents }),
  setLoading: (loading) => set({ loading }),
  addSignup: (eventId) =>
    set((state) => ({
      events: state.events.map((e) =>
        e.id === eventId ? { ...e, filled_spots: (e.filled_spots || 0) + 1 } : e
      ),
    })),
  removeSignup: (eventId) =>
    set((state) => ({
      events: state.events.map((e) =>
        e.id === eventId ? { ...e, filled_spots: Math.max(0, (e.filled_spots || 0) - 1) } : e
      ),
    })),
}));

export default useEventStore;
