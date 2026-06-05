import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import ResponsiveContainer from '../../components/ui/ResponsiveContainer';
import Screen from '../../components/ui/Screen';
import useAuthStore from '../../store/authStore';
import { sendBroadcast } from '../../services/broadcast';
import { notify, confirm } from '../../services/ui';

const AUDIENCES = [
  { key: 'bn',          label: 'BetterNature',           desc: 'Everyone in the org (members, presidents, execs)' },
  { key: 'restaurants', label: 'Food Donors',            desc: 'Approved restaurant partners' },
  { key: 'all',         label: 'Everyone',               desc: 'BetterNature + food donors' },
];

export default function BroadcastScreen({ navigation }) {
  const user = useAuthStore((s) => s.user);
  // Execs (and super_admins) broadcast org-wide. A chapter pres
  // can ONLY broadcast to their own chapter — chapter_id stamped on
  // the announcement + recipient filter enforces scoping.
  const isExecLike = ['executive', 'admin', 'super_admin'].includes(user?.role);
  const presChapterId = !isExecLike ? (user?.chapter_id || null) : null;
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [audience, setAudience] = useState('bn');
  const [loading, setLoading] = useState(false);

  async function handleSend() {
    if (!title.trim() || !message.trim()) {
      notify('Required', 'Title and message are both required.');
      return;
    }
    const audMeta = AUDIENCES.find((a) => a.key === audience);
    const ok = await confirm(
      `Send to ${audMeta.label}?`,
      `Everyone in this audience will get an in-app notification, a browser push (if enabled), and an email (if opted in). This can't be unsent.`
    );
    if (!ok) return;
    setLoading(true);
    try {
      const result = await sendBroadcast({
        title, message, audience,
        sentBy: user?.id || null,
        chapterId: presChapterId, // null for execs (org-wide)
      });
      if (!result?.ok) {
        notify('Could not send', result?.reason || 'Something went wrong. Try again.');
        return;
      }
      notify(
        'Broadcast sent',
        `${result.inappCount || 0} in-app · ${result.pushCount || 0} push queued · ${result.emailCount || 0} email queued.`
      );
      navigation.goBack();
    } catch (e) {
      notify('Could not send', e?.message || 'Try again.');
    } finally { setLoading(false); }
  }

  return (
    <Screen contentStyle={styles.content}>
      <ResponsiveContainer maxWidth={780}>
        <Text style={styles.back} onPress={() => navigation.goBack()}>‹ Back</Text>
        <BrushText variant="screenTitle" style={styles.title}>Broadcast</BrushText>
        <Text style={styles.subtitle}>
          {presChapterId
            ? `Goes to your chapter only — every other chapter stays untouched.`
            : `Sends an in-app notification + email to everyone in the chosen audience.`}
        </Text>

        <Text style={styles.label}>Audience</Text>
        <View style={{ gap: 8, marginBottom: 18 }}>
          {AUDIENCES.map((a) => {
            const active = audience === a.key;
            return (
              <TouchableOpacity
                key={a.key}
                style={[styles.audCard, active && styles.audCardActive]}
                onPress={() => setAudience(a.key)}
                activeOpacity={0.85}
              >
                <View style={[styles.audDot, active && styles.audDotActive]}>
                  {active ? <View style={styles.audDotInner} /> : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.audLabel, active && { color: Colors.green }]}>{a.label}</Text>
                  <Text style={styles.audDesc}>{a.desc}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <Input label="Title" placeholder="Announcement title" value={title} onChangeText={setTitle} />
        <Input
          label="Message"
          placeholder="What's the announcement?"
          value={message}
          onChangeText={setMessage}
          multiline
          style={{ minHeight: 120, textAlignVertical: 'top' }}
        />

        <View style={styles.charCount}>
          <Text style={styles.charText}>
            {message.length} characters · SMS will arrive as {message.length > 160 ? Math.ceil(message.length / 160) : 1} segment{message.length > 160 ? 's' : ''}
          </Text>
        </View>

        <Button title="Send broadcast" onPress={handleSend} loading={loading} style={styles.btn} />
      </ResponsiveContainer>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream, ...(Platform.OS === 'web' ? { height: '100vh' } : null) },
  content: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  back: { fontSize: 16, color: Colors.green, marginBottom: 8 },
  title: { color: Colors.green },
  subtitle: { ...Type.body, color: Colors.gray, marginTop: 4, marginBottom: 24 },
  label: { fontSize: 12, fontWeight: '800', color: Colors.gray, marginBottom: 8, letterSpacing: 0.5, textTransform: 'uppercase' },
  audCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, borderRadius: 14, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.glassBorder },
  audCardActive: { borderColor: Colors.green, backgroundColor: '#E8F5EE' },
  audDot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: Colors.grayMid, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  audDotActive: { borderColor: Colors.green },
  audDotInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.green },
  audLabel: { fontSize: 15, fontWeight: '800', color: Colors.dark },
  audDesc: { ...Type.caption, marginTop: 2 },
  charCount: { marginTop: 8, marginBottom: 8 },
  charText: { ...Type.caption, color: Colors.grayMid },
  btn: { marginTop: 16 },
});
