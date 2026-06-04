import { useEffect } from 'react';
import useAuthStore from '../store/authStore';
import { onAuthStateChange, getProfile } from '../services/auth';
import { ensureFounderRole } from '../services/founder';
import { login as oneSignalLogin, logout as oneSignalLogout, setTags as oneSignalSetTags, addEmail as oneSignalAddEmail } from '../services/onesignal';
import { isFirebaseConfigured } from '../config/firebase';

export default function useAuth() {
  const { setUser, setSession, setLoading } = useAuthStore();

  useEffect(() => {
    // If Firebase isn't configured we never get a callback — clear loading
    // immediately so the app doesn't hang on the LoadingScreen forever.
    if (!isFirebaseConfigured) {
      setLoading(false);
      return;
    }
    // Safety net: if Firebase doesn't fire within 4s (offline, network
    // hiccup), unblock the UI anyway so the user can sign in manually.
    const fallback = setTimeout(() => setLoading(false), 4000);
    const { data: subscription } = onAuthStateChange(async (session) => {
      clearTimeout(fallback);
      setSession(session);
      if (session?.user) {
        // Firebase users use `uid`; our profile docs key off that. Fall back
        // to a thin user object if the Firestore read fails so the app still
        // boots into an authed state on reload.
        const uid = session.user.uid || session.user.id;
        try {
          let profile = await getProfile(uid);
          // Founder bootstrap: if the email is on the hard-coded founder
          // list and their role isn't already executive/admin, promote
          // them so they can actually create chapters etc. on day one.
          profile = await ensureFounderRole(profile || { id: uid, email: session.user.email });
          setUser(profile || { id: uid, email: session.user.email });
          // OneSignal identity — scope notifications to the BN user
          // across devices, not just to whichever browser is open.
          oneSignalLogin(uid).catch(() => {});
          if (profile?.email) oneSignalAddEmail(profile.email).catch(() => {});
          // Tags so the OneSignal dashboard can segment without us
          // running a backfill query for every campaign.
          oneSignalSetTags({
            role:       profile?.role || 'member',
            chapter_id: profile?.chapter_id || '',
            country:    profile?.country || '',
          }).catch(() => {});
        } catch {
          setUser({ id: uid, email: session.user.email });
        }
      } else {
        setUser(null);
        // Drop the OneSignal external user id so a future sign-in
        // doesn't inherit the previous user's segments.
        oneSignalLogout().catch(() => {});
      }
      setLoading(false);
    });

    return () => {
      clearTimeout(fallback);
      subscription?.subscription?.unsubscribe();
    };
  }, []);

  return useAuthStore();
}
