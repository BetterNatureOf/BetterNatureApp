import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import useAuthStore from '../store/authStore';
import { fetchPickups, fetchMyActivePickups } from '../services/database';
import { rescueOfferDeadline } from '../services/rescueCells';

export default function usePickups() {
  const userId = useAuthStore((s) => s.user?.id);
  const chapterId = useAuthStore((s) => s.user?.chapter_id);
  const [result, setResult] = useState(null);
  const [, setExpiryTick] = useState(0);
  const request = useRef(0);

  const loadPickups = useCallback(async () => {
    if (!userId) return;
    const current = ++request.current;
    setResult({ userId, chapterId, loading: true });
    const [feed, mine] = await Promise.allSettled([
      chapterId ? fetchPickups(chapterId) : [],
      fetchMyActivePickups(userId),
    ]);
    if (current !== request.current) return;
    const byId = new Map([...(feed.value || []), ...(mine.value || [])].map((p) => [p.id, p]));
    setResult({
      userId,
      chapterId,
      pickups: [...byId.values()],
      error: feed.status === 'rejected' || mine.status === 'rejected',
    });
  }, [userId, chapterId]);

  useFocusEffect(useCallback(() => {
    loadPickups();
    return () => { request.current++; };
  }, [loadPickups]));

  const scoped = result?.userId === userId && result?.chapterId === chapterId ? result : null;
  const now = Date.now();
  let nextExpiry = Infinity;
  const pickups = (scoped?.pickups || []).filter((pickup) => {
    if (pickup.status !== 'available') return true;
    const cutoff = rescueOfferDeadline(pickup);
    if (cutoff === null || cutoff <= now) return false;
    nextExpiry = Math.min(nextExpiry, cutoff);
    return true;
  });
  useEffect(() => {
    if (!Number.isFinite(nextExpiry)) return;
    const timer = setTimeout(() => setExpiryTick((tick) => tick + 1), Math.max(0, nextExpiry - Date.now()));
    return () => clearTimeout(timer);
  }, [nextExpiry]);
  return {
    pickups,
    loading: !!userId && (!scoped || !!scoped.loading),
    error: !!scoped?.error,
    loadPickups,
  };
}
