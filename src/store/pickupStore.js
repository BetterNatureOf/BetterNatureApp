import { create } from 'zustand';

const usePickupStore = create((set) => ({
  pickups: [],
  loading: false,

  setPickups: (pickups) => set({ pickups }),
  setLoading: (loading) => set({ loading }),
  claimPickup: (pickupId, userId) =>
    set((state) => ({
      pickups: state.pickups.map((p) =>
        p.id === pickupId
          ? { ...p, status: 'claimed', claimed_by: userId, claimed_at: new Date().toISOString() }
          : p
      ),
    })),
  unclaimPickup: (pickupId) =>
    set((state) => ({
      pickups: state.pickups.map((p) =>
        p.id === pickupId
          ? { ...p, status: 'available', claimed_by: null, claimed_at: null }
          : p
      ),
    })),
}));

export default usePickupStore;
