// "Open in Maps" deep-link helper.
//
// Behavior by platform:
//   - iOS: tries Apple Maps first (maps://) then falls back to Google Maps
//   - Android / web: Google Maps universal URL — opens whatever map app
//     the user has set as default, or the browser
//
// Always pass an address string when possible; lat/lng works as a fallback.
// Both can be supplied — addr is the human label, coords are exact.
import { Linking, Platform, Alert } from 'react-native';

function encode(s) { return encodeURIComponent(String(s).trim()); }

export async function openInMaps({ address, lat, lng, label }) {
  const hasCoords = lat != null && lng != null && !Number.isNaN(Number(lat));
  const q = address ? encode(address) : (hasCoords ? `${lat},${lng}` : '');
  if (!q) return false;

  const labelPart = label ? `(${encode(label)})` : '';
  const candidates = Platform.OS === 'ios'
    ? [
        // Apple Maps native — shows the system "Choose app" prompt only
        // if the user has multiple map apps installed and a default set.
        hasCoords
          ? `maps://?q=${encode(label || address || `${lat},${lng}`)}&ll=${lat},${lng}`
          : `maps://?q=${q}`,
        // Google Maps fallback if Apple Maps isn't available somehow
        `https://maps.apple.com/?q=${q}`,
        `https://www.google.com/maps/search/?api=1&query=${q}`,
      ]
    : [
        // Android & web — universal Google Maps URL. Android with Google
        // Maps installed will offer to open in-app; otherwise browser.
        hasCoords
          ? `geo:${lat},${lng}?q=${lat},${lng}${labelPart}`
          : `geo:0,0?q=${q}`,
        `https://www.google.com/maps/search/?api=1&query=${q}`,
      ];

  for (const url of candidates) {
    try {
      const ok = await Linking.canOpenURL(url);
      if (ok) { await Linking.openURL(url); return true; }
    } catch {}
  }
  // Last resort — open the Google Maps web URL directly.
  try { await Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${q}`); return true; }
  catch (e) {
    Alert.alert('Could not open Maps', e.message || 'No map app available.');
    return false;
  }
}

// Pretty single-line address. Pass any subset of fields.
export function formatAddress({ street, address, city, state, zip } = {}) {
  const line1 = (address || street || '').trim();
  const tail = [city, state].filter(Boolean).join(', ') + (zip ? ` ${zip}` : '');
  return [line1, tail].filter(Boolean).join(', ').trim();
}
