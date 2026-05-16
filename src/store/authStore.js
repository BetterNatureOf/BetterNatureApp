import { create } from 'zustand';

// Roles supported across the app:
//   member            — regular volunteer
//   restaurant        — restaurant partner submitting food donations
//   chapter_president — leads a single chapter
//   executive         — C-suite, full org-wide controls
export const ROLES = {
  MEMBER: 'member',
  RESTAURANT: 'restaurant',
  PRESIDENT: 'chapter_president',
  EXECUTIVE: 'executive',
};

const useAuthStore = create((set) => ({
  user: null,
  session: null,
  isLoading: true,
  isAuthenticated: false,
  role: null,

  setUser: (user) =>
    set({
      user,
      isAuthenticated: !!user,
      role: user?.role || ROLES.MEMBER,
    }),
  setSession: (session) => set({ session }),
  setLoading: (isLoading) => set({ isLoading }),
  setRole: (role) =>
    set((state) => ({
      role,
      user: state.user ? { ...state.user, role } : state.user,
    })),
  signOut: () => {
    // Wipe the persisted navigation state too — otherwise a freshly signed-out
    // user would briefly try to restore a route that requires auth.
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem('BN_NAV_STATE_v1');
      }
    } catch {}
    set({ user: null, session: null, isAuthenticated: false, role: null });
  },
}));

export default useAuthStore;
