import { useEffect } from 'react';
import useAuthStore from '../store/authStore';
import { onAuthStateChange, getProfile } from '../services/auth';

export default function useAuth() {
  const { setUser, setSession, setLoading } = useAuthStore();

  useEffect(() => {
    const { data: subscription } = onAuthStateChange(async (session) => {
      setSession(session);
      if (session?.user) {
        try {
          const profile = await getProfile(session.user.id);
          setUser(profile);
        } catch {
          setUser({ id: session.user.id, email: session.user.email });
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => subscription?.subscription?.unsubscribe();
  }, []);

  return useAuthStore();
}
