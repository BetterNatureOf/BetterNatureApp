import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Colors, Type } from '../../config/theme';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { manageVolunteerHistory } from '../../services/database';
import VerifiedImpact from '../../components/impact/VerifiedImpact';

function duration(minutes) {
  if (minutes === null) return 'Time unrecorded';
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export default function VolunteerHistory({ memberId }) {
  const [history, setHistory] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [date, setDate] = useState('');
  const [minutes, setMinutes] = useState('');
  const [description, setDescription] = useState('');
  const [change, setChange] = useState(null);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setHistory(await manageVolunteerHistory(memberId));
    } catch (error) {
      setError(error.message || 'Couldn’t load activity.');
    }
  }, [memberId]);
  useEffect(() => { load(); }, [load]);

  function startChange(entry, kind) {
    setChange({ id: entry.id, version: entry.version, kind, label: entry.label });
    setDate(entry.date);
    setMinutes(String(entry.minutes));
    setDescription(entry.label);
    setReason('');
    setError('');
  }

  function resetForm() {
    setChange(null);
    setDate('');
    setMinutes('');
    setDescription('');
    setReason('');
  }

  async function save() {
    setSaving(true);
    setError('');
    try {
      const entry = { date: date.trim(), minutes: Number(minutes), description };
      if (change) {
        await manageVolunteerHistory(memberId, null, { id: change.id, version: change.version, kind: change.kind,
          reason, ...(change.kind === 'correct' ? { entry } : {}) });
      } else {
        await manageVolunteerHistory(memberId, entry);
      }
      resetForm();
      await load();
    } catch (error) {
      if (error.code === 'functions/failed-precondition') {
        resetForm();
        await load();
      }
      setError(error.message || 'Couldn’t save the work entry.');
    } finally { setSaving(false); }
  }

  const voiding = change?.kind === 'void';
  const missingWork = !date.trim() || !minutes.trim() || !description.trim();

  const form = (
    <View style={{ gap: 8, marginTop: 8 }}>
      <Text accessibilityRole="header" style={[Type.body, { fontWeight: '700', marginTop: 8 }]}>
        {change ? (voiding ? 'Void manual work' : 'Correct manual work') : 'Log work done outside the app'}
      </Text>
      {change ? <Text style={Type.caption}>{change.label}{voiding ? ' will be removed from the hours total.' : ''}</Text>
        : <Text style={Type.caption}>Use the date the work happened, including work done before the app. App deliveries appear automatically.</Text>}
      {!voiding && (
        <>
          <Input label="Work date (YYYY-MM-DD)" accessibilityLabel="Work date" autoFocus={!!change} value={date} onChangeText={setDate} />
          <Input label="Minutes worked" accessibilityLabel="Minutes worked" value={minutes} keyboardType="number-pad" onChangeText={setMinutes} />
          <Input label="Description" accessibilityLabel="Description" value={description} maxLength={160} onChangeText={setDescription} />
        </>
      )}
      {change && <Input label="Reason for change" accessibilityLabel="Reason for change" value={reason}
        maxLength={240} onChangeText={setReason} autoFocus={voiding} />}
      <Button title={change ? (voiding ? 'Confirm void' : 'Save correction') : 'Save work entry'} loading={saving}
        disabled={(!voiding && missingWork) || (!!change && !reason.trim())} onPress={save} />
      {change && <Button title="Cancel change" variant="secondary" disabled={saving} onPress={resetForm} />}
    </View>
  );

  return (
    <View style={{ gap: 10, paddingVertical: 12 }}>
      <Text accessibilityRole="header" style={[Type.body, { color: Colors.dark, fontWeight: '700' }]}>Volunteer activity</Text>
      <VerifiedImpact memberId={memberId} />
      {!!error && <Text accessibilityRole="alert" style={Type.body}>{error}</Text>}
      {!history && (error ? <Button title="Retry loading activity" variant="secondary" onPress={load} />
        : <Text accessibilityRole="status" style={Type.body}>Loading activity…</Text>)}
      {history && (
        <>
          <Text style={[Type.body, { fontWeight: '700' }]}>
            {duration(history.deliveryMinutes + history.manualMinutes)} recorded
          </Text>
          <Text style={Type.body}>
            Deliveries {duration(history.deliveryMinutes)} · Manual work {duration(history.manualMinutes)}
          </Text>
          <Text style={Type.caption}>Voided entries are kept in the history and excluded from the total.</Text>
          {history.entries.length === 0 && <Text style={Type.body}>No delivery or manual work entries yet.</Text>}
          {history.entries.map((entry) => (
            <View key={`${entry.kind}:${entry.id}`} style={{ paddingVertical: 8, borderBottomWidth: 1, borderColor: Colors.grayLight }}>
              <Text style={[Type.body, { fontWeight: '600' }]}>{entry.label}</Text>
              <Text style={Type.caption}>{entry.date || 'Date unrecorded'} · {entry.kind === 'delivery' ? 'App delivery' : 'Manual work'} · {duration(entry.minutes)}{entry.voided ? ' · Voided' : ''}</Text>
              {!!entry.destination && <Text style={Type.caption}>Delivered to {entry.destination}</Text>}
              {entry.changes?.map((revision) => (
                <View key={revision.version} style={{ marginTop: 8 }}>
                  <Text style={Type.caption}>{revision.kind === 'void' ? 'Voided' : 'Corrected'} by {revision.actor_name || revision.actor_id} · {new Date(revision.changed_at).toLocaleString()}</Text>
                  <Text style={Type.caption}>Before · {revision.before.date} · {duration(revision.before.minutes)} · {revision.before.description}</Text>
                  {revision.after && <Text style={Type.caption}>After · {revision.after.date} · {duration(revision.after.minutes)} · {revision.after.description}</Text>}
                  <Text style={Type.caption}>Reason · {revision.reason}</Text>
                </View>
              ))}
              {entry.kind === 'manual' && change?.id === entry.id && form}
              {entry.kind === 'manual' && !entry.voided && !change && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                  <Button title="Correct entry" variant="secondary" disabled={saving} onPress={() => startChange(entry, 'correct')} />
                  <Button title="Void entry" variant="secondary" disabled={saving} onPress={() => startChange(entry, 'void')} />
                </View>
              )}
            </View>
          ))}
          {!change && form}
        </>
      )}
    </View>
  );
}
