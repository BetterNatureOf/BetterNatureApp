// BN Map for the marketing site. Same look as the app's BN Map:
// two tabs (Food Insecurity / Fridges), Food Insecurity default.
//
//   - Food Insecurity: Robinson world choropleth + US states overlay
//   - Fridges: Leaflet + OpenStreetMap with markers from Firestore
//
// Loads heavy libs (d3@7, topojson-client, Leaflet) lazily so the
// homepage's first paint stays fast.
import { COUNTRIES_BY_NUMERIC, colorForRate } from './insecurityByCountry.js';
import { STATE_BY_FIPS } from './insecurityByState.js';

const D3      = 'https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js';
const TOPO    = 'https://cdn.jsdelivr.net/npm/topojson-client@3/dist/topojson-client.min.js';
const WORLD   = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';
const STATES  = 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json';
const LEAF_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
const LEAF_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';

function loadScript(url) {
  if (window[`__bn:${url}`]) return Promise.resolve();
  if (window[`__bn_pending:${url}`]) return window[`__bn_pending:${url}`];
  window[`__bn_pending:${url}`] = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url; s.async = true;
    s.onload = () => { window[`__bn:${url}`] = true; resolve(); };
    s.onerror = () => reject(new Error('script load ' + url));
    document.head.appendChild(s);
  });
  return window[`__bn_pending:${url}`];
}
function loadCss(url) {
  if (document.querySelector(`link[data-bn-css="${url}"]`)) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.href = url; l.dataset.bnCss = url;
  document.head.appendChild(l);
}

// Same Robinson lookup d3-geo-projection uses internally.
const HALF_PI = Math.PI / 2;
const ROBINSON_K = [
  [0.9986,-0.062],[1.0000,0.0000],[0.9986,0.0620],[0.9954,0.1240],
  [0.9900,0.1860],[0.9822,0.2480],[0.9730,0.3100],[0.9600,0.3720],
  [0.9427,0.4340],[0.9216,0.4958],[0.8962,0.5571],[0.8679,0.6176],
  [0.8350,0.6769],[0.7986,0.7346],[0.7597,0.7903],[0.7186,0.8435],
  [0.6732,0.8936],[0.6213,0.9394],[0.5722,0.9761],[0.5322,1.0000],
].map(([a, b]) => [a, b * 1.0144]);
function robinsonRaw(lambda, phi) {
  const absPhi = Math.abs(phi);
  const i = Math.min(18, absPhi * 36 / Math.PI);
  const i0 = Math.floor(i);
  const di = i - i0;
  const a = ROBINSON_K[i0];
  const b = ROBINSON_K[Math.min(19, i0 + 1)];
  const c = ROBINSON_K[Math.min(19, i0 + 2)];
  const dx = b[0] + di * (c[0] - a[0]) / 2 + di * di * (c[0] - 2 * b[0] + a[0]) / 2;
  const dy = b[1] + di * (c[1] - a[1]) / 2 + di * di * (c[1] - 2 * b[1] + a[1]) / 2;
  return [lambda * dx, (phi >= 0 ? HALF_PI : -HALF_PI) * dy];
}

async function renderInsecurity(container) {
  container.innerHTML = '<div class="bnmap__loading">Loading world map…</div>';
  await loadScript(D3);
  await loadScript(TOPO);
  const [world, usStates] = await Promise.all([
    fetch(WORLD).then((r) => r.json()),
    fetch(STATES).then((r) => r.json()).catch(() => null),
  ]);
  const d3 = window.d3; const topojson = window.topojson;
  container.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'bnmap__svgwrap';
  container.appendChild(wrapper);

  function draw() {
    wrapper.innerHTML = '';
    const w = wrapper.clientWidth || 960;
    const h = Math.round(w / 1.97);
    const projection = d3.geoProjection(robinsonRaw).fitSize([w, h], { type: 'Sphere' });
    const path = d3.geoPath(projection);

    const svg = d3.select(wrapper).append('svg')
      .attr('viewBox', `0 0 ${w} ${h}`)
      .style('width', '100%')
      .style('display', 'block')
      .style('background', '#F7F5EF')
      .style('border-radius', '14px');

    const tooltip = d3.select(wrapper).append('div').attr('class', 'bnmap__tip').style('display', 'none');

    function showTip(html) {
      tooltip.style('display', 'block').html(html);
    }
    function hideTip() { tooltip.style('display', 'none'); }

    // Countries
    const countries = topojson.feature(world, world.objects.countries).features;
    svg.selectAll('path.country').data(countries).enter().append('path')
      .attr('class', 'country').attr('d', path)
      .attr('fill', (f) => {
        const id = String(f.id).padStart(3, '0');
        const meta = COUNTRIES_BY_NUMERIC[id];
        return colorForRate(meta?.rate);
      })
      .attr('stroke', '#FFFFFFA0').attr('stroke-width', 0.6)
      .on('mouseenter', (ev, f) => {
        const id = String(f.id).padStart(3, '0');
        const meta = COUNTRIES_BY_NUMERIC[id];
        if (!meta) { showTip('<em>No data yet</em>'); return; }
        showTip(`
          <div class="bnmap__tip-eyebrow">Country</div>
          <div class="bnmap__tip-name">${meta.name}</div>
          <div class="bnmap__tip-rate" style="color:${colorForRate(meta.rate)}">${meta.rate}% <span>food insecure</span></div>
        `);
      })
      .on('mouseleave', hideTip);

    // US states overlay
    if (usStates && usStates.objects?.states) {
      const states = topojson.feature(usStates, usStates.objects.states).features;
      svg.selectAll('path.state').data(states).enter().append('path')
        .attr('class', 'state').attr('d', path)
        .attr('fill', (f) => {
          const fips = String(f.id).padStart(2, '0');
          return colorForRate(STATE_BY_FIPS[fips]?.rate);
        })
        .attr('stroke', '#1B3A2D60').attr('stroke-width', 0.5)
        .on('mouseenter', (ev, f) => {
          const fips = String(f.id).padStart(2, '0');
          const m = STATE_BY_FIPS[fips];
          if (!m) return;
          showTip(`
            <div class="bnmap__tip-eyebrow">US state</div>
            <div class="bnmap__tip-name">${m.name}, USA</div>
            <div class="bnmap__tip-rate" style="color:${colorForRate(m.rate)}">${m.rate}% <span>food insecure</span></div>
          `);
        })
        .on('mouseleave', hideTip);
    }
  }
  draw();
  if (window.ResizeObserver) {
    new ResizeObserver(() => draw()).observe(wrapper);
  }
}

async function renderFridges(container) {
  container.innerHTML = '<div class="bnmap__loading">Loading fridge network…</div>';
  loadCss(LEAF_CSS);
  await loadScript(LEAF_JS);
  const { listFridges } = await import('./firebase-fridges.js');
  const fridges = await listFridges();
  container.innerHTML = '';
  const host = document.createElement('div');
  host.style.width = '100%';
  host.style.height = '520px';
  host.style.borderRadius = '14px';
  host.style.overflow = 'hidden';
  container.appendChild(host);

  const valid = fridges.filter((f) => f.lat != null && f.lng != null);
  const center = valid.length ? [valid[0].lat, valid[0].lng] : [39.5, -98.35];
  const map = window.L.map(host, { center, zoom: valid.length ? 11 : 4, scrollWheelZoom: true });
  window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors', maxZoom: 19,
  }).addTo(map);
  const layer = window.L.layerGroup().addTo(map);
  valid.forEach((f) => {
    const color = f.capacity === 'low' ? '#EF4444'
                : f.capacity === 'high' ? '#1B3A2D' : '#FF4D8D';
    const icon = window.L.divIcon({
      className: 'bn-fridge-marker',
      html: `<div style="background:${color};width:18px;height:18px;border-radius:50%;border:3px solid #FFF;box-shadow:0 2px 6px rgba(0,0,0,.25)"></div>`,
      iconSize: [18, 18], iconAnchor: [9, 9],
    });
    const popup = `
      <strong>${(f.name || 'Community fridge').replace(/</g, '&lt;')}</strong>
      ${f.address ? `<div style="font-size:12px;color:#7A766C;margin-top:4px">${f.address}</div>` : ''}
      ${f.hours ? `<div style="font-size:12px;margin-top:6px">Hours: ${f.hours}</div>` : ''}
      ${f.capacity ? `<div style="font-size:12px;margin-top:2px">Capacity: ${f.capacity}</div>` : ''}
    `;
    window.L.marker([f.lat, f.lng], { icon }).bindPopup(popup).addTo(layer);
  });
  if (valid.length > 0) {
    const bounds = window.L.latLngBounds(valid.map((f) => [f.lat, f.lng]));
    map.fitBounds(bounds.pad(0.2));
  }
}

export function mountBnMap(rootEl) {
  if (!rootEl) return;
  rootEl.innerHTML = `
    <div class="bnmap__tabs">
      <button type="button" class="bnmap__tab is-active" data-tab="insecurity">Food Insecurity</button>
      <button type="button" class="bnmap__tab" data-tab="fridges">Fridges</button>
    </div>
    <div class="bnmap__surface" id="bnmapSurface"></div>
  `;
  const surface = rootEl.querySelector('#bnmapSurface');
  const tabs = rootEl.querySelectorAll('.bnmap__tab');
  let current = null;
  function activate(name) {
    if (current === name) return;
    current = name;
    tabs.forEach((b) => b.classList.toggle('is-active', b.dataset.tab === name));
    (name === 'fridges' ? renderFridges : renderInsecurity)(surface);
  }
  tabs.forEach((b) => b.addEventListener('click', () => activate(b.dataset.tab)));
  activate('insecurity');
}
