// H3's Emscripten runtime includes a decoder fallback. Hermes exposes
// TextDecoder but cannot construct the UTF-16 decoder H3 probes at import.
const decoder = globalThis.TextDecoder;
let h3;
try {
  globalThis.TextDecoder = undefined;
  h3 = require('h3-js');
} finally {
  globalThis.TextDecoder = decoder;
}

export const { latLngToCell, cellToBoundary, cellToLatLng } = h3;
