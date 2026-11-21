import React, { useEffect, useRef, useState } from 'react';
import { Text } from 'react-native';
import { Colors } from '../../config/theme';
import { openDirections } from '../../services/maps';
import { ensureLeaflet } from './leafletLoader';

export default function ActiveRescueMap({ stop, droppingOff, action, status }) {
  const element = useRef(null);
  const [failed, setFailed] = useState(false);
  const { lat, lng, name, address } = stop;
  const hasPoint = Number.isFinite(lat) && Number.isFinite(lng) &&
    Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const destination = hasPoint ? { lat, lng } : address;
  const appleDirections = destination
    ? 'https://maps.apple.com/directions?mode=driving&destination=' +
      encodeURIComponent(hasPoint ? `${lat},${lng}` : address)
    : null;

  useEffect(() => {
    if (!hasPoint) return;
    let disposed = false;
    let map;
    setFailed(false);
    ensureLeaflet().then((L) => {
      if (disposed) return;
      map = L.map(element.current, { scrollWheelZoom: false, zoomControl: false }).setView([lat, lng], 15);
      const basemap = map.createPane('rescueBasemap');
      basemap.style.zIndex = '200';
      basemap.style.filter = 'saturate(.15) contrast(.78) brightness(1.16)';
      basemap.style.opacity = '0.58';
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19, pane: 'rescueBasemap',
      }).addTo(map);
      L.circleMarker([lat, lng], {
        radius: 11, fillColor: Colors.green, fillOpacity: 1, color: Colors.cream, weight: 3,
      }).addTo(map);
      L.control.zoom({ position: 'topright' }).addTo(map);
    }).catch(() => { if (!disposed) setFailed(true); });
    return () => {
      disposed = true;
      map?.remove();
    };
  }, [lat, lng, hasPoint]);

  return (
    <div style={{ border: '1px solid #dce8e0', overflow: 'hidden', borderRadius: 20, background: Colors.greenLight, marginBottom: 16 }}>
      {hasPoint && <div ref={element} style={{ height: failed ? 0 : 230 }} />}
      <div style={{ display: 'grid', gap: 8, padding: 18, background: Colors.cream }}>
        <Text style={{ color: Colors.green, fontWeight: '700', fontSize: 12 }}>
          {droppingOff ? 'NEXT STOP · DROP-OFF' : 'NEXT STOP · PICKUP'}
        </Text>
        <Text style={{ color: Colors.dark, fontWeight: '700', fontSize: 21 }}>{name}</Text>
        {address ? <Text selectable style={{ color: Colors.gray }}>{address}</Text> : null}
        {status && <Text style={{ color: Colors.gray, fontSize: 14, lineHeight: 20 }}>{status}</Text>}
        {action}
        {destination ? (
          <div style={{ display: 'grid', gap: 4, marginTop: 4 }}>
            <a href={appleDirections} target="_blank" rel="noopener noreferrer" style={{
              boxSizing: 'border-box', display: 'grid', placeItems: 'center',
              padding: '10px 16px', minHeight: 48, borderRadius: 14, background: action ? 'transparent' : Colors.green,
              color: action ? Colors.green : Colors.white, textAlign: 'center', textDecoration: 'none', font: '650 16px system-ui',
            }}>Directions in Apple Maps ↗</a>
            <button type="button" onClick={() => openDirections({ destination, label: name })} style={{
              minHeight: 44, background: 'transparent', border: 0,
              color: Colors.green, font: '600 14px system-ui', cursor: 'pointer',
            }}>Use Google Maps instead</button>
          </div>
        ) : <Text style={{ color: Colors.gray }}>Address unavailable. Check the pickup details or contact the partner.</Text>}
      </div>
    </div>
  );
}
