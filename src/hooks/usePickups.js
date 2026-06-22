import { useEffect, useCallback } from 'react';
import usePickupStore from '../store/pickupStore';
import useAuthStore from '../store/authStore';
import { fetchPickups, fetchMyActivePickups, claimPickup as claimPickupApi } from '../services/database';

export default function usePickups() {
  const { pickups, loading, setPickups, setLoading, claimPickup: claimInStore } = usePickupStore();
  const user = useAuthStore((s) => s.user);

  const loadPickups = useCallback(async () => {
    setLoading(true);
    try {
      // Union the chapter feed (available pickups everyone can claim)
      // with the volunteer's OWN claimed/enroute pickups so MyPickups
      // doesn't go silent the moment they tap Claim.
      const [feed, mine] = await Promise.all([
        fetchPickups(user?.chapter_id),
        user?.id ? fetchMyActivePickups(user.id) : Promise.resolve([]),
      ]);
      // De-dupe by id (a claimed pickup shouldn't appear in the feed
      // anyway but defensively guard).
      const byId = new Map();
      for (const p of feed) byId.set(p.id, p);
      for (const p of mine) byId.set(p.id, p);
      setPickups([...byId.values()]);
    } catch (e) {
      console.error('Failed to load pickups:', e);
    } finally {
      setLoading(false);
    }
  }, [user?.chapter_id, user?.id]);

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
