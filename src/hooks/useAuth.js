import { useEffect } from 'react';
import useAuthStore from '../store/authStore';
import { onAuthStateChange, getProfile } from '../services/auth';
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
          const profile = await getProfile(uid);
          setUser(profile || { id: uid, email: session.user.email });
        } catch {
          setUser({ id: uid, email: session.user.email });
        }
      } else {
        setUser(null);
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
