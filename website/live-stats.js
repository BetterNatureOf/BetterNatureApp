// Replaces the static hero ticker + impact grid + program stats with
// live numbers from Firestore. Runs after app.js paints the static
// CONTENT defaults — so the page never flashes wrong numbers; it just
// upgrades from "0" / draft values to the latest counts.
//
// Source of truth: org_stats/global  (bumped by the app whenever a
// pickup is completed or a volunteer is checked in).
import { fetchOrgStats, statsToTicker, statsToImpactCards } from './org-stats.js';

function fmt(n) {
  if (!n || n < 1000) return String(n || 0);
  return n.toLocaleString('en-US');
}

function repaintTicker(items) {
  const track = document.getElementById('tickerTrack');
  if (!track) return;
  const html = items.map(s =>
    `<span class="ticker__item"><span class="ticker__value">${s.value}</span><span class="ticker__label">${s.label}</span></span><span class="ticker__dot">●</span>`
  ).join('');
  track.innerHTML = html + html;
}

function repaintImpactGrid(stats) {
  const grid = document.getElementById('impactGrid');
  if (!grid) return;
  grid.innerHTML = stats.map(s => `
    <div class="stat reveal">
      <div class="stat__value">${s.value}</div>
      <div class="stat__label">${s.label}</div>
      <div class="stat__sub">${s.sublabel}</div>
    </div>
  `).join('');
}

// Replace the project tiles' inline stats — IRIS shows meals/lbs/CO₂,
// Hydro shows water gallons. Evergreen has no live counter yet so we
// leave its launch placeholder alone.
function repaintProgramStats(s) {
  const irisCard = document.querySelector('[data-program="iris"] .program__stats');
  if (irisCard) {
    irisCard.innerHTML = `
      <div class="program__stat"><strong>${fmt(s.lbs)} lbs</strong><span>food rescued</span></div>
      <div class="program__stat"><strong>${fmt(s.co2)} lbs</strong><span>CO₂ avoided</span></div>
      <div class="program__stat"><strong>${fmt(s.water)} gal</strong><span>water saved</span></div>
    `;
  }
  const hydroCard = document.querySelector('[data-program="hydro"] .program__stats');
  if (hydroCard) {
    hydroCard.innerHTML = `
      <div class="program__stat"><strong>${fmt(s.water)} gal</strong><span>water footprint reduced</span></div>
    `;
  }
}

// Wait for the DOM node app.js paints before we try to write into
// it. Without this the IIFE fires at module load and every
// `document.getElementById(...)` returns null because app.js
// hasn't run its render yet — the whole ticker/impact/program
// repaint silently no-ops. Poll up to 5 seconds (10 tries) then
// give up gracefully.
function waitForNode(id, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      const el = document.getElementById(id);
      if (el) return resolve(el);
      if (Date.now() - start > timeoutMs) return resolve(null);
      setTimeout(tick, 250);
    };
    tick();
  });
}

async function paintLiveStats() {
  try {
    // Wait until the ticker DOM exists — that's app.js's signal
    // that the initial static paint is done.
    await waitForNode('tickerTrack');
    const stats = await fetchOrgStats();
    const total = (stats.meals || 0) + (stats.lbs || 0) + (stats.individuals || 0)
                + (stats.co2 || 0) + (stats.water || 0);
    if (total === 0) return; // leave static CONTENT numbers in place
    repaintTicker(statsToTicker(stats));
    repaintImpactGrid(statsToImpactCards(stats));
    repaintProgramStats(stats);
  } catch (e) {
    console.warn('live stats failed', e);
  }
}

// Fire once when the module loads (works if app.js already ran)
// and again on DOMContentLoaded (works if app.js is still parsing).
// The waitForNode above makes both safe even if they race.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', paintLiveStats);
} else {
  paintLiveStats();
}
