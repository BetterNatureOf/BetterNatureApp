import { useEffect, useCallback } from 'react';
import usePickupStore from '../store/pickupStore';
import useAuthStore from '../store/authStore';
import { fetchPickups, claimPickup as claimPickupApi } from '../services/database';

export default function usePickups() {
  const { pickups, loading, setPickups, setLoading, claimPickup: claimInStore } = usePickupStore();
  const user = useAuthStore((s) => s.user);

  const loadPickups = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchPickups(user?.chapter_id);
      setPickups(data);
    } catch (e) {
      console.error('Failed to load pickups:', e);
    } finally {
      setLoading(false);
    }
  }, [user?.chapter_id]);

  const claim = useCallback(
    async (pickupId) => {
      if (!user?.id) return;
      await claimPickupApi(pickupId, user.id);
      claimInStore(pickupId, user.id);
    },
    [user?.id]
  );

  useEffect(() => {
    if (user) loadPickups();
  }, [user, loadPickups]);

  return { pickups, loading, loadPickups, claim };
}
