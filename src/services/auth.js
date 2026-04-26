// Auth shim — forwards to the Firebase implementation so all existing
// screens (LoginScreen, SignupStep3, useAuth, ProfileScreen, etc.) work
// without changes. The native app, the web version of the app, and the
// website all share the same Firebase project, so accounts are unified.
//
// The old Supabase implementation lives in git history if we ever need it.
export {
  signUp,
  signIn,
  signOut,
  getProfile,
  updateProfile,
  uploadIdDocument,
  onAuthStateChange,
} from './authFirebase';
