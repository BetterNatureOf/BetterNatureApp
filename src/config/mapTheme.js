// Rescue map look and configuration, shared by the web (Mapbox GL JS) and
// native (@rnmapbox/maps) renderers and their fallbacks.
//
// Mapbox is the intended map provider. The PUBLIC token
// (EXPO_PUBLIC_MAPBOX_TOKEN, starts with "pk.") is meant to ship in the app
// and should be URL-restricted in the Mapbox account. The server routing
// token (MAPBOX_SERVER_TOKEN) never appears in client code.
import { Colors } from './theme';

export const MAPBOX_PUBLIC_TOKEN = (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_MAPBOX_TOKEN) || '';
export const hasMapboxToken = () => /^pk\./.test(MAPBOX_PUBLIC_TOKEN);

// Mapbox GL JS version and CDN (docs.mapbox.com/mapbox-gl-js/guides/install).
export const MAPBOX_GL_VERSION = 'v3.35.0';

// Mapbox Standard, quieted: warm daylight, no 3D, no business/transit
// labels, restrained parks, subdued roads, readable street names.
export const MAPBOX_STYLE = 'mapbox://styles/mapbox/standard';
export const MAPBOX_BASEMAP_CONFIG = {
  lightPreset: 'day',
  theme: 'faded',
  showPointOfInterestLabels: false,
  showTransitLabels: false,
  showPlaceLabels: true,
  showRoadLabels: true,
  show3dObjects: false,
  colorLand: '#F6F1E8',
  colorGreenspace: '#E3E9DD',
  colorWater: '#D7E3E4',
  colorRoads: '#FFFFFF',
  colorTrunks: '#F3EBDD',
  colorMotorways: '#EFE3CF',
};

export const MAP_COLORS = {
  route: Colors.green,
  routeCasing: '#FFFFFF',
  pickup: Colors.green,
  pickupSoon: '#B7791F',
  destination: '#1F3A30',
  cluster: Colors.green,
  clusterText: '#FFFFFF',
  selectedRing: '#FFFFFF',
  approximateArea: 'rgba(47, 93, 80, 0.10)',
};

// Camera padding so stops sit above the bottom sheet.
export const SHEET_PADDING = { top: 72, right: 40, bottom: 220, left: 40 };

// Raster fallback (when Mapbox can't load): OSM tiles, warmed and quieted.
export const FALLBACK_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const FALLBACK_ATTRIBUTION = '&copy; OpenStreetMap contributors';
export const FALLBACK_TILE_FILTER = 'grayscale(.55) sepia(.18) contrast(.86) brightness(1.08)';
