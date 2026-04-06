import { create } from 'zustand';

const useDonationStore = create((set) => ({
  donations: [],
  totalDonated: 0,
  loading: false,

  setDonations: (donations) => set({ donations }),
  setTotalDonated: (totalDonated) => set({ totalDonated }),
  setLoading: (loading) => set({ loading }),
  addDonation: (donation) =>
    set((state) => ({
      donations: [donation, ...state.donations],
      totalDonated: state.totalDonated + donation.amount,
    })),
}));

export default useDonationStore;
