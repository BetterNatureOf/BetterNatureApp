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

  // Web: Linking.canOpenURL is unreliable in browsers (returns false
  // for plain https URLs in react-native-web). Open a Google Maps
  // directions URL in a new tab directly.
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const url = hasCoords
      ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
      : `https://www.google.com/maps/search/?api=1&query=${q}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    return true;
  }

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

// Google Maps directions URL — destination required, origin
// optional (defaults to the user's current location). On web we
// pop a new tab; on native we hand off to the OS' default Maps app.
export async function openDirections({ destination, origin, label }) {
  if (!destination) return false;
  const dq = typeof destination === 'string'
    ? encode(destination)
    : `${destination.lat},${destination.lng}`;
  const oq = origin && (origin.lat || typeof origin === 'string')
    ? (typeof origin === 'string' ? encode(origin) : `${origin.lat},${origin.lng}`)
    : null;
  const url = oq
    ? `https://www.google.com/maps/dir/?api=1&origin=${oq}&destination=${dq}`
    : `https://www.google.com/maps/dir/?api=1&destination=${dq}`;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
    return true;
  }
  try { await Linking.openURL(url); return true; }
  catch (e) {
    Alert.alert('Could not open Maps', e.message || 'No map app available.');
    return false;
  }
}

// Browser geolocation wrapped in a single-shot Promise.
export function getCurrentPosition(opts = {}) {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.reject(new Error('Geolocation not available'));
  }
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      reject,
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60 * 1000, ...opts },
    );
  });
}

// Haversine — miles between two {lat,lng} points. Used to give the
// volunteer a rough "X mi away" badge on the pickup detail screen.
export function milesBetween(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return null;
  const R = 3958.7613;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

// Pretty single-line address. Pass any subset of fields.
export function formatAddress({ street, address, city, state, zip } = {}) {
  const line1 = (address || street || '').trim();
  const tail = [city, state].filter(Boolean).join(', ') + (zip ? ` ${zip}` : '');
  return [line1, tail].filter(Boolean).join(', ').trim();
}
