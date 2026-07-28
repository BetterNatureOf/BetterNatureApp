// Notifications inbox — split into "For you" (unread + actionable) and
// "Recent" (everything else) so the user's eye lands on what needs
// action first instead of scrolling through a chronological wall.
//
// Tapping a notification:
//   - marks it read
//   - if it carries a URL (pickup/event/receipt deep link), navigates
//     to that screen; otherwise just marks read
//
// The URL format is
//   https://app.betternatureofficial.org/#/pickups/{id}   (canonical)
//   https://app.betternatureofficial.org/#/pickup/{id}    (legacy singular from
//     notifications persisted before the emitter was aligned)
// We accept both — the singular is only kept for old rows in Firestore.
import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import Icon from '../../components/ui/Icon';
import useNotifStore from '../../store/notifStore';
import { fetchNotifications, markNotificationRead } from '../../services/database';
import useAuthStore from '../../store/authStore';
import Screen from '../../components/ui/Screen';

// Icon per notification kind — Icon component for consistency with the
// rest of the app instead of hand-painted emojis.
const KIND_ICON = {
  pickup:   { name: 'clipboard', tint: Colors.green },
  event:    { name: 'calendar',  tint: Colors.pink },
  volunteer:{ name: 'user',      tint: Colors.sage },
  broadcast:{ name: 'bell',      tint: Colors.skyDark },
  welcome:  { name: 'gift',      tint: Colors.pink },
  general:  { name: 'info',      tint: Colors.gray },
};
function iconFor(kind) {
  return KIND_ICON[kind] || KIND_ICON.general;
}

// "2h ago" / "3d ago" / "just now" — much more useful than a raw date.
// Falls back to the raw date for anything older than a week.
function relative(iso) {
  if (!iso) return '';
  let t = 0;
  if (typeof iso === 'string' || typeof iso === 'number') {
    t = new Date(iso).getTime();
  } else if (typeof iso?.toMillis === 'function') {
    t = iso.toMillis();
  } else if (typeof iso?.seconds === 'number') {
    t = iso.seconds * 1000;
  }
  if (!t || Number.isNaN(t)) return '';
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 45)         return 'just now';
  if (s < 90)         return '1m ago';
  if (s < 60 * 45)    return `${Math.round(s / 60)}m ago`;
  if (s < 60 * 90)    return '1h ago';
  if (s < 60 * 60 * 24)      return `${Math.round(s / 3600)}h ago`;
  if (s < 60 * 60 * 24 * 7)  return `${Math.round(s / 86400)}d ago`;
  return new Date(t).toLocaleDateString();
}

// Pull the resource + id out of an in-app notification URL. Returns
// { screen, params } or null if there's nothing to navigate to.
// Accepts both the hash-routed web URL and any bare "/pickup/xyz"
// path so future emitters (push handlers, deep-link openers) don't
// need to know the exact wire format.
function parseNotifUrl(url) {
  if (!url) return null;
  try {
    const s = String(url);
    const path = s.includes('#/') ? s.split('#/')[1] : s.replace(/^.*?:\/\/[^/]+/, '').replace(/^\//, '');
    const [resource, id] = (path || '').split('/').filter(Boolean);
    if (!resource || !id) return null;
    if (resource === 'pickup' || resource === 'pickups') return { screen: 'PickupDetail', params: { pickupId: id } };
    if (resource === 'event'  || resource === 'events')  return { screen: 'EventDetail',  params: { id } };
    return null;
  } catch { return null; }
}

// Actionable ≡ unread AND carries a URL we can route to. Anything
// else (already-read, or informational broadcasts with no url) goes
// into the Recent bucket.
function isActionable(n) {
  return !n.read && !!parseNotifUrl(n.url);
}

export default function NotificationsScreen({ navigation }) {
  const user = useAuthStore((s) => s.user);
  const { notifications, setNotifications, markRead, markAllRead } = useNotifStore();

  useEffect(() => { loadNotifs(); }, []);

  async function loadNotifs() {
    if (!user?.id) return;
    try {
      const data = await fetchNotifications(user.id);
      setNotifications(data);
    } catch (e) { console.error(e); }
  }

  async function handlePress(notif) {
    if (!notif.read) {
      markRead(notif.id);
      markNotificationRead(notif.id).catch(() => {});
    }
    const target = parseNotifUrl(notif.url);
    if (target) {
      try { navigation.navigate(target.screen, target.params); } catch {}
    }
  }

  const actionable = notifications.filter(isActionable);
  const recent     = notifications.filter((n) => !isActionable(n));

  return (
    <Screen contentStyle={styles.content}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>{'‹ Back'}</Text>
        </TouchableOpacity>
        {actionable.length > 0 || notifications.some((n) => !n.read) ? (
          <TouchableOpacity onPress={markAllRead}>
            <Text style={styles.markAll}>Mark all read</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <BrushText variant="screenTitle" style={styles.title}>
        Notifications
      </BrushText>

      {notifications.length === 0 ? (
        <EmptyAll />
      ) : (
        <>
          <SectionHeader
            label="For you"
            count={actionable.length}
            hint={actionable.length ? 'Tap to jump straight to what needs your attention.' : null}
          />
          {actionable.length === 0 ? (
            <EmptyCaughtUp />
          ) : (
            actionable.map((n) => (
              <NotifRow key={n.id} notif={n} onPress={() => handlePress(n)} highlighted />
            ))
          )}

          {recent.length > 0 ? (
            <>
              <SectionHeader label="Recent" count={recent.length} />
              {recent.map((n) => (
                <NotifRow key={n.id} notif={n} onPress={() => handlePress(n)} />
              ))}
            </>
          ) : null}
        </>
      )}
    </Screen>
  );
}

function SectionHeader({ label, count, hint }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{label}</Text>
      {typeof count === 'number' ? (
        <View style={styles.sectionCount}>
          <Text style={styles.sectionCountText}>{count}</Text>
        </View>
      ) : null}
      {hint ? <Text style={styles.sectionHint}>{hint}</Text> : null}
    </View>
  );
}

function NotifRow({ notif, onPress, highlighted }) {
  const kind = iconFor(notif.kind || notif.type);
  const target = parseNotifUrl(notif.url);
  return (
    <TouchableOpacity
      style={[styles.notifCard, highlighted && styles.notifCardHighlighted]}
      onPress={onPress}
      activeOpacity={0.82}
    >
      <View style={[styles.iconWrap, { backgroundColor: kind.tint + '22' }]}>
        <Icon name={kind.name} size={18} color={kind.tint} strokeWidth={2} />
      </View>
      <View style={styles.notifBody}>
        <View style={styles.notifTitleRow}>
          <Text style={styles.notifTitle} numberOfLines={1}>{notif.title || 'Update'}</Text>
          <Text style={styles.notifTime}>{relative(notif.created_at)}</Text>
        </View>
        {notif.body || notif.description ? (
          <Text style={styles.notifDesc} numberOfLines={2}>{notif.body || notif.description}</Text>
        ) : null}
        {target && highlighted ? (
          <Text style={styles.notifCta}>
            {target.screen === 'PickupDetail' ? 'Open pickup →' : 'Open →'}
          </Text>
        ) : null}
      </View>
      {!notif.read ? <View style={styles.unreadDot} /> : null}
    </TouchableOpacity>
  );
}

function EmptyAll() {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Icon name="clipboard" size={26} color={Colors.green} />
      </View>
      <Text style={styles.emptyTitle}>Nothing yet</Text>
      <Text style={styles.emptyBody}>
        You'll see pickups near you, event RSVPs, receipt links, and the occasional shout-out here.
      </Text>
    </View>
  );
}
function EmptyCaughtUp() {
  return (
    <View style={styles.caughtUp}>
      <Icon name="check" size={16} color={Colors.green} strokeWidth={2.5} />
      <Text style={styles.caughtUpText}>You're all caught up.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
    ...(Platform.OS === 'web' ? { height: '100vh' } : null),
  },
  content: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  back: { fontSize: 16, color: Colors.green },
  markAll: { fontSize: 13, color: Colors.pink, fontWeight: '700' },
  title: { color: Colors.green, marginTop: 8, marginBottom: 20 },

  sectionHeader: { marginTop: 8, marginBottom: 10, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  sectionTitle: { fontSize: 12, fontWeight: '800', letterSpacing: 1.3, textTransform: 'uppercase', color: Colors.green },
  sectionCount: {
    minWidth: 20, height: 20, borderRadius: 10, backgroundColor: Colors.green + '18',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6,
  },
  sectionCountText: { fontSize: 11, fontWeight: '800', color: Colors.green },
  sectionHint: { flexBasis: '100%', fontSize: 12, color: Colors.gray, marginTop: 2 },

  notifCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: 14,
    marginBottom: 8,
    gap: 12,
    ...Shadows.soft,
  },
  notifCardHighlighted: {
    borderWidth: 1,
    borderColor: Colors.green + '55',
    backgroundColor: '#F4FBF6',
  },
  iconWrap: {
    width: 36, height: 36, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  notifBody: { flex: 1, minWidth: 0 },
  notifTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  notifTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: Colors.dark },
  notifTime: { fontSize: 11, color: Colors.grayMid, fontWeight: '600' },
  notifDesc: { ...Type.caption, marginTop: 3, lineHeight: 18 },
  notifCta: { marginTop: 6, fontSize: 12, fontWeight: '800', color: Colors.green, letterSpacing: 0.3 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.pink, marginTop: 6 },

  caughtUp: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 14, paddingHorizontal: 14,
    backgroundColor: Colors.greenLight,
    borderRadius: Radius.lg,
    marginBottom: 20,
  },
  caughtUpText: { fontSize: 13, fontWeight: '700', color: '#1B5E3F' },

  empty: { alignItems: 'center', padding: 40 },
  emptyIcon: {
    width: 56, height: 56, borderRadius: 16,
    backgroundColor: Colors.greenLight,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: Colors.dark, marginBottom: 6 },
  emptyBody: { ...Type.caption, textAlign: 'center', maxWidth: 320, lineHeight: 19 },
});
