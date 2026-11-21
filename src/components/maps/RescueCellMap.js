import React, { useEffect, useRef, useState } from 'react';
import { Text } from 'react-native';
import { cellToBoundary, cellToLatLng } from 'h3-js';
import { Colors } from '../../config/theme';
import { ensureLeaflet } from './leafletLoader';

const sheetStyles = `
  .iris-map-sheet {
    background: #faf8f5;
    border: 1px solid #fff;
    animation: iris-sheet-in 180ms cubic-bezier(.2,.8,.2,1) both;
  }
  @supports (backdrop-filter: blur(20px)) or (-webkit-backdrop-filter: blur(20px)) {
    .iris-map-sheet {
      background: rgba(250,248,245,.94);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
    }
  }
  .iris-map-sheet button:focus-visible { outline: 2px solid #2a5648; outline-offset: -2px; }
  @keyframes iris-sheet-in {
    from { opacity: .65; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @media (prefers-reduced-motion: reduce) {
    .iris-map-sheet { animation: none; }
  }
  @media (prefers-reduced-transparency: reduce), (prefers-contrast: more) {
    .iris-map-sheet { background: #faf8f5; border-color: #2a5648; backdrop-filter: none; -webkit-backdrop-filter: none; }
  }
`;

export default function RescueCellMap({ cells, selected, onSelect, onResolution, summary, children }) {
  const container = useRef(null);
  const restoreMarkerFocus = useRef(null);
  const layers = useRef(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [tilesReady, setTilesReady] = useState(false);
  const [tileError, setTileError] = useState(false);
  const framed = useRef(false);
  const overview = useRef(null);

  useEffect(() => {
    let map;
    let alive = true;
    ensureLeaflet().then((L) => {
      if (!alive) return;
      map = L.map(container.current, { scrollWheelZoom: false, zoomControl: false }).setView([35.15, -90.05], 11);
      const basemap = map.createPane('rescueBasemap');
      basemap.style.zIndex = '200';
      basemap.style.filter = 'saturate(.15) contrast(.78) brightness(1.16)';
      basemap.style.opacity = '0.58';
      const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, pane: 'rescueBasemap',
        attribution: '&copy; OpenStreetMap contributors',
      });
      tiles.on('loading', () => { if (alive) setTileError(false); });
      tiles.on('tileerror', () => { if (alive) setTileError(true); });
      tiles.on('load', () => { if (alive) setTilesReady(true); });
      L.control.zoom({ position: 'topright' }).addTo(map);
      const layer = L.layerGroup().addTo(map);
      layers.current = { L, layer, map, tiles };
      map.on('zoomend', () => {
        const zoom = map.getZoom();
        onResolution(zoom <= 9 ? 7 : zoom >= 13 ? 9 : 8);
      });
      setReady(true);
    }).catch(() => { if (alive) setFailed(true); });

    return () => {
      alive = false;
      map?.remove();
      layers.current = null;
    };
  }, [onResolution]);

  useEffect(() => {
    if (!ready || !layers.current) return;
    const { L, layer, map, tiles } = layers.current;
    layer.clearLayers();
    const bounds = [];
    for (const cell of cells) {
      const boundary = cellToBoundary(cell.id);
      bounds.push(...boundary);
      const fillColor = cell.closingSoon ? Colors.amber : Colors.green;
      const focused = selected === cell.id;
      const color = focused ? Colors.green : fillColor;
      L.polygon(boundary, {
        color, fillColor, fillOpacity: focused ? 0.24 : 0.09,
        opacity: focused ? 0.72 : 0.12, weight: focused ? 2 : 1,
      }).addTo(layer).on('click', () => onSelect(cell.id));
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = cell.closingSoon ? `◷ ${cell.pickups.length}` : String(cell.pickups.length);
      button.setAttribute('aria-label', `${cell.pickups.length} open pickups, ${cell.closingSoon} closing soon`);
      button.setAttribute('aria-pressed', String(selected === cell.id));
      Object.assign(button.style, {
        minWidth: '46px', minHeight: '44px', borderRadius: '22px',
        border: '2px solid white', background: cell.closingSoon ? Colors.amberLight : Colors.green,
        color: cell.closingSoon ? '#724415' : Colors.white, boxShadow: '0 2px 8px #20392e30',
        font: '700 14px system-ui', cursor: 'pointer',
      });
      L.DomEvent.disableClickPropagation(button);
      button.addEventListener('click', () => {
        if (document.activeElement === button) restoreMarkerFocus.current = cell.id;
        onSelect(cell.id);
      });
      L.marker(cellToLatLng(cell.id), {
        keyboard: false,
        rescueCellId: cell.id,
        icon: L.divIcon({ html: button, className: '', iconSize: [46, 44] }),
      }).addTo(layer);
    }
    if (restoreMarkerFocus.current) {
      layer.eachLayer((marker) => {
        if (marker.options?.rescueCellId === restoreMarkerFocus.current) {
          marker.getElement()?.querySelector('button')?.focus({ preventScroll: true });
        }
      });
      restoreMarkerFocus.current = null;
    }
    overview.current = bounds.length ? bounds : null;
    if (bounds.length && !framed.current) {
      framed.current = true;
      map.fitBounds(bounds, { animate: false, maxZoom: 12, paddingTopLeft: [28, 64], paddingBottomRight: [28, 150] });
    }
    if (!map.hasLayer(tiles)) tiles.addTo(map);
  }, [cells, ready, selected, onSelect]);

  return (
    <div onKeyDown={(event) => {
      if (event.key === 'Escape' && selected) {
        restoreMarkerFocus.current = selected;
        onSelect(selected);
      }
    }} style={{ position: 'relative', borderRadius: 24, overflow: 'hidden', isolation: 'isolate', background: Colors.greenLight }}>
      <style>{sheetStyles}</style>
      {failed && <Text style={{ padding: 16 }}>Map unavailable. Use List to see pickups.</Text>}
      <div ref={container} style={{ zIndex: 0, height: failed ? 0 : 'clamp(340px, calc(100dvh - 280px), 680px)' }} />
      {!tilesReady && !failed && (
        <div role="status" style={{ position: 'absolute', inset: 0, zIndex: 600, display: 'grid',
          placeItems: 'center', background: Colors.greenLight }}>
          <Text style={{ color: Colors.green }}>Loading map…</Text>
        </div>
      )}
      {ready && (
        <button type="button" aria-label="Show all pickups" title="Show all pickups" onClick={() => {
          if (overview.current) layers.current?.map.fitBounds(overview.current, {
            maxZoom: 12, paddingTopLeft: [28, 64], paddingBottomRight: [28, 150],
          });
          if (selected) onSelect(selected);
        }} style={{
          position: 'absolute', top: 12, left: 12, zIndex: 500, minHeight: 44, minWidth: 44,
          padding: '0 8px', border: 0, borderRadius: 14, background: Colors.cream,
          color: Colors.green, font: '600 22px system-ui', cursor: 'pointer', boxShadow: '0 2px 10px #20392e24',
        }}><span aria-hidden="true">⌖</span></button>
      )}
      {selected ? <div className="iris-map-sheet" role="region" aria-label="Pickup routes in this area" style={{
        position: failed ? 'relative' : 'absolute', bottom: failed ? 0 : 21, left: 12, right: 12,
        zIndex: 500, padding: 16, borderRadius: 24,
        boxShadow: '0 6px 28px #20392e26', maxHeight: 190, overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <Text accessibilityRole="header" style={{ fontFamily: 'system-ui', color: Colors.dark, fontSize: 17, fontWeight: '700' }}>Pickups in this area</Text>
          <button type="button" aria-label="Close pickup routes" onClick={() => {
            restoreMarkerFocus.current = selected;
            onSelect(selected);
          }} style={{
            width: 44, height: 44, flexShrink: 0, borderRadius: 22, border: 0,
            background: Colors.greenLight, color: Colors.green, font: '22px system-ui', cursor: 'pointer',
          }}>×</button>
        </div>
        {children}
      </div> : (
        <div style={{ padding: '10px 14px', background: Colors.cream, borderTop: '1px solid #e0e8e3' }}>
          {tileError && <Text style={{ color: Colors.gray }}>Some map areas are unavailable. All pickups are in List.</Text>}
          {summary}
        </div>
      )}
    </div>
  );
}
