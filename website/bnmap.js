// BN Map for the marketing site. Same look as the app's BN Map:
// two tabs (Food Insecurity / Fridges), Food Insecurity default.
//
//   - Food Insecurity: Robinson world choropleth + US states overlay
//   - Fridges: 3D MapLibre map with ZIP search (see fridge-map.js)
//
// Loads heavy libs (d3@7, topojson-client, Leaflet) lazily so the
// homepage's first paint stays fast.
import { COUNTRIES_BY_NUMERIC, topInsecure } from './insecurityByCountry.js';
import { STATE_BY_FIPS } from './insecurityByState.js';

const D3      = 'https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js';
const TOPO    = 'https://cdn.jsdelivr.net/npm/topojson-client@3/dist/topojson-client.min.js';
const WORLD   = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';
const STATES  = 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json';

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

// Severity ramp on the dark map: brighter = worse. Muted forest for the
// least affected, blush through Better Nature pink for the most.
const RAMP = [
  { min: 60, color: '#FFB3CF', label: '60%+' },
  { min: 40, color: '#FF6FA2', label: '40' },
  { min: 25, color: '#E5487F', label: '25' },
  { min: 15, color: '#A9406B', label: '15' },
  { min: 8, color: '#6E3F57', label: '8' },
  { min: 0, color: '#3E5A4C', label: '0' },
];
const NO_DATA = '#24392F';
function rampColor(rate) {
  if (rate == null) return NO_DATA;
  return (RAMP.find((r) => rate >= r.min) || RAMP[RAMP.length - 1]).color;
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
  const top = topInsecure(6);

  container.innerHTML = `
    <div class="imap">
      <div class="imap__side">
        <div class="fmap__eyebrow">Food insecurity</div>
        <h3 class="imap__title">Where hunger runs highest</h3>
        <p class="imap__lede">Share of people without reliable access to enough food. Hover any country, or any US state.</p>
        <ol class="imap__top">${top.map((c, i) => `
          <li><button type="button" data-name="${c.name}"><span class="imap__rank">${String(i + 1).padStart(2, '0')}</span><strong>${c.name}</strong><em style="color:${rampColor(c.rate)}">${c.rate}%</em></button></li>`).join('')}
        </ol>
      </div>
      <div class="imap__stage">
        <div class="bnmap__svgwrap"></div>
        <div class="imap__tip" hidden></div>
        <div class="imap__legend" aria-hidden="true">
          <span>Less</span>
          <span class="imap__ramp" style="background:linear-gradient(90deg, ${RAMP.slice().reverse().map((r) => r.color).join(', ')})"></span>
          <span>More</span>
          <span class="imap__nodata"><i></i>No data</span>
        </div>
      </div>
    </div>`;

  const wrapper = container.querySelector('.bnmap__svgwrap');
  const stage = container.querySelector('.imap__stage');
  const tip = container.querySelector('.imap__tip');
  let paths = [];

  function showTip(ev, kind, name, rate) {
    const r = stage.getBoundingClientRect();
    tip.innerHTML = rate == null
      ? `<div class="imap__tipKind">${kind}</div><div class="imap__tipName">${name || 'Unknown'}</div><div class="imap__tipRate"><span>No data yet</span></div>`
      : `<div class="imap__tipKind">${kind}</div><div class="imap__tipName">${name}</div><div class="imap__tipRate" style="color:${rampColor(rate)}">${rate}%<span>food insecure</span></div>`;
    tip.style.left = `${Math.min(Math.max(ev.clientX - r.left, 100), r.width - 100)}px`;
    tip.style.top = `${Math.max(ev.clientY - r.top, 90)}px`;
    tip.hidden = false;
  }
  const hideTip = () => { tip.hidden = true; };

  function draw() {
    wrapper.innerHTML = '';
    // Fit to the inhabited world (no Antarctica, which has no data), so the
    // countries fill the stage instead of the whole globe.
    const countries = topojson.feature(world, world.objects.countries).features;
    const land = { type: 'FeatureCollection', features: countries.filter((f) => String(f.id) !== '010') };
    const w = wrapper.clientWidth || 900;
    const b = d3.geoPath(d3.geoProjection(robinsonRaw)).bounds(land);
    const h = Math.round(w / ((b[1][0] - b[0][0]) / (b[1][1] - b[0][1])));
    const projection = d3.geoProjection(robinsonRaw).fitExtent([[2, 2], [w - 2, h - 2]], land);
    const path = d3.geoPath(projection);
    const svg = d3.select(wrapper).append('svg').attr('viewBox', `0 0 ${w} ${h}`).attr('role', 'img')
      .attr('aria-label', 'World map of food insecurity rates');

    // engraved globe: sphere outline + faint graticule
    svg.append('path').datum({ type: 'Sphere' }).attr('d', path).attr('fill', '#0D1F17').attr('stroke', 'rgba(239,233,220,0.18)').attr('stroke-width', 1);
    svg.append('path').datum(d3.geoGraticule10()).attr('d', path).attr('fill', 'none').attr('stroke', 'rgba(239,233,220,0.06)').attr('stroke-width', 0.6);

    svg.selectAll('path.country').data(land.features).enter().append('path')
      .attr('class', 'country').attr('d', path)
      .attr('fill', (f) => rampColor(COUNTRIES_BY_NUMERIC[String(f.id).padStart(3, '0')]?.rate))
      .attr('stroke', 'rgba(239,233,220,0.22)').attr('stroke-width', 0.4)
      .attr('data-name', (f) => COUNTRIES_BY_NUMERIC[String(f.id).padStart(3, '0')]?.name || '')
      .on('mousemove', (ev, f) => {
        const m = COUNTRIES_BY_NUMERIC[String(f.id).padStart(3, '0')];
        showTip(ev, 'Country', m ? m.name : (f.properties && f.properties.name), m ? m.rate : null);
      })
      .on('mouseleave', hideTip);

    if (usStates && usStates.objects?.states) {
      const states = topojson.feature(usStates, usStates.objects.states).features;
      svg.selectAll('path.state').data(states).enter().append('path')
        .attr('class', 'state').attr('d', path)
        .attr('fill', (f) => rampColor(STATE_BY_FIPS[String(f.id).padStart(2, '0')]?.rate))
        .attr('stroke', 'rgba(239,233,220,0.3)').attr('stroke-width', 0.35)
        .on('mousemove', (ev, f) => {
          const m = STATE_BY_FIPS[String(f.id).padStart(2, '0')];
          if (m) showTip(ev, 'US state', `${m.name}, USA`, m.rate);
        })
        .on('mouseleave', hideTip);
    }
    paths = Array.from(wrapper.querySelectorAll('path.country'));
  }

  // The ranked list highlights its country on the map.
  container.querySelectorAll('.imap__top button').forEach((b) => {
    const on = () => {
      container.querySelectorAll('.imap__top button').forEach((x) => x.classList.toggle('is-active', x === b));
      paths.forEach((p) => p.classList.toggle('is-hot', p.dataset.name === b.dataset.name));
    };
    b.addEventListener('mouseenter', on);
    b.addEventListener('focus', on);
    b.addEventListener('click', on);
  });

  draw();
  if (window.ResizeObserver) {
    let last = 0;
    new ResizeObserver(() => {
      const w = wrapper.clientWidth;
      if (Math.abs(w - last) > 4) { last = w; draw(); }
    }).observe(wrapper);
  }
}

// Fridges tab: the 3D MapLibre map lives in fridge-map.js.
async function renderFridges(container) {
  const { renderFridgeMap } = await import('./fridge-map.js?v=2026-11-25d');
  return renderFridgeMap(container);
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
