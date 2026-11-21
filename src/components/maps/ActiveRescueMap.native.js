import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Button from '../ui/Button';
import { Colors } from '../../config/theme';
import { openDirections } from '../../services/maps';

export default function ActiveRescueMap({ stop, droppingOff, status, action }) {
  const destination = stop.address || (Number.isFinite(stop.lat) && Number.isFinite(stop.lng)
    ? `${stop.lat},${stop.lng}` : null);
  return (
    <View style={styles.panel}>
      <Text style={styles.label}>{droppingOff ? 'NEXT STOP · DROP-OFF' : 'NEXT STOP · PICKUP'}</Text>
      <Text accessibilityRole="header" style={styles.title}>{stop.name}</Text>
      {!!stop.address && <Text selectable>{stop.address}</Text>}
      {!!status && <Text>{status}</Text>}
      {!!destination && <Button title="Get directions" variant="secondary"
        onPress={() => openDirections({ destination, label: stop.name })} />}
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: Colors.greenLight, borderRadius: 16, padding: 16, gap: 8 },
  label: { color: Colors.green, fontSize: 12, fontWeight: '700' },
  title: { color: Colors.dark, fontSize: 21, fontWeight: '700' },
});
