// Falling cherry-blossom petals and leaves (from the Better Nature tree)
// drawn on a canvas behind brand surfaces. Purely decorative:
//   • petals drift away from the mouse and a click/tap scatters a burst
//   • hidden from assistive tech, never intercepts clicks
//   • still frame for "Reduce motion"; paused while the tab is hidden
import React, { useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';

const PETAL_COLORS = ['#F9C9D4', '#F6B3C2', '#F28AA9', '#FBE3E9'];
const LEAF_COLORS = ['#9FD0B4', '#7FBF9C'];
const MAX_PARTICLES = 140;

function makeParticle(w, h, { x, y, burst = false } = {}) {
  const leaf = Math.random() < 0.18;
  const angle = Math.random() * Math.PI * 2;
  const speed = burst ? 1.5 + Math.random() * 3 : 0;
  return {
    x: x ?? Math.random() * w,
    y: y ?? Math.random() * h,
    vx: burst ? Math.cos(angle) * speed : (Math.random() - 0.5) * 0.3,
    vy: burst ? Math.sin(angle) * speed - 1 : 0.25 + Math.random() * 0.45,
    size: leaf ? 7 + Math.random() * 5 : 5 + Math.random() * 6,
    rot: Math.random() * Math.PI * 2,
    vr: (Math.random() - 0.5) * 0.04,
    sway: Math.random() * Math.PI * 2,
    leaf,
    color: leaf ? LEAF_COLORS[(Math.random() * LEAF_COLORS.length) | 0]
      : PETAL_COLORS[(Math.random() * PETAL_COLORS.length) | 0],
    alpha: 0.55 + Math.random() * 0.4,
    life: burst ? 1 : Infinity,
  };
}

function drawPetal(ctx, p) {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rot);
  ctx.globalAlpha = Math.min(p.alpha, p.life);
  ctx.fillStyle = p.color;
  const s = p.size;
  ctx.beginPath();
  if (p.leaf) {
    // pointed leaf with a center vein
    ctx.moveTo(0, -s);
    ctx.quadraticCurveTo(s * 0.8, 0, 0, s);
    ctx.quadraticCurveTo(-s * 0.8, 0, 0, -s);
    ctx.fill();
    ctx.strokeStyle = 'rgba(31,68,56,0.35)';
    ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(0, -s * 0.8); ctx.lineTo(0, s * 0.8); ctx.stroke();
  } else {
    // cherry-blossom petal: rounded with a small notch at the tip
    ctx.moveTo(0, s);
    ctx.bezierCurveTo(s * 0.9, s * 0.4, s * 0.7, -s * 0.8, s * 0.12, -s * 0.7);
    ctx.lineTo(0, -s * 0.45);
    ctx.lineTo(-s * 0.12, -s * 0.7);
    ctx.bezierCurveTo(-s * 0.7, -s * 0.8, -s * 0.9, s * 0.4, 0, s);
    ctx.fill();
  }
  ctx.restore();
}

// quietZone: CSS position of a soft area where petals fade to ~25% so
// they never compete with the text drawn over them (e.g. '30% 55%').
export default function BlossomField({ density = 38, quietZone = null, style }) {
  const host = useRef(null);

  useEffect(() => {
    const container = host.current;
    if (!container || typeof window === 'undefined') return undefined;
    const surface = container.parentElement || container;
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' });
    if (quietZone) {
      const mask = `radial-gradient(ellipse 55% 45% at ${quietZone}, rgba(0,0,0,0.22) 0%, rgba(0,0,0,0.22) 45%, #000 100%)`;
      canvas.style.maskImage = mask;
      canvas.style.webkitMaskImage = mask;
    }
    container.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    let w = 0, h = 0, dpr = 1, frame = 0, running = true;
    let particles = [];
    const mouse = { x: -9999, y: -9999, active: false };

    function resize() {
      const r = container.getBoundingClientRect();
      dpr = window.devicePixelRatio || 1;
      w = r.width; h = r.height;
      canvas.width = Math.max(1, w * dpr); canvas.height = Math.max(1, h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const target = Math.round(density * Math.min(1.6, Math.max(0.5, (w * h) / (600 * 800))));
      while (particles.filter((p) => p.life === Infinity).length < target) particles.push(makeParticle(w, h));
      if (reduce) render();
    }

    function render() {
      ctx.clearRect(0, 0, w, h);
      for (const p of particles) drawPetal(ctx, p);
    }

    function step() {
      for (const p of particles) {
        p.sway += 0.015;
        p.x += p.vx + Math.sin(p.sway) * 0.35;
        p.y += p.vy;
        p.rot += p.vr;
        // gentle drag back toward a slow fall after a push or burst
        p.vx *= 0.97;
        p.vy = p.vy * 0.97 + (p.life === Infinity ? 0.012 : 0.03);
        if (p.life !== Infinity) p.life -= 0.006;
        if (mouse.active) {
          const dx = p.x - mouse.x, dy = p.y - mouse.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 120 * 120 && d2 > 1) {
            const d = Math.sqrt(d2), force = (1 - d / 120) * 0.9;
            p.vx += (dx / d) * force; p.vy += (dy / d) * force * 0.6;
          }
        }
        if (p.life === Infinity) {
          if (p.y - p.size > h) { p.y = -p.size; p.x = Math.random() * w; p.vy = 0.25 + Math.random() * 0.45; }
          if (p.x < -20) p.x = w + 10; else if (p.x > w + 20) p.x = -10;
        }
      }
      particles = particles.filter((p) => p.life > 0 && (p.life === Infinity || p.y < h + 30));
      render();
    }

    function loop() {
      if (!running) return;
      step();
      frame = requestAnimationFrame(loop);
    }

    function local(e) {
      const r = container.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    function onMove(e) { const pt = local(e); mouse.x = pt.x; mouse.y = pt.y; mouse.active = true; }
    function onLeave() { mouse.active = false; }
    function onDown(e) {
      const { x, y } = local(e);
      const room = MAX_PARTICLES - particles.length;
      for (let i = 0; i < Math.min(16, room); i++) particles.push(makeParticle(w, h, { x, y, burst: true }));
    }
    function onVisibility() {
      if (document.hidden) { running = false; cancelAnimationFrame(frame); }
      else if (!reduce && !running) { running = true; loop(); }
    }

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    ro?.observe(container);
    resize();
    if (!reduce) {
      surface.addEventListener('pointermove', onMove);
      surface.addEventListener('pointerleave', onLeave);
      surface.addEventListener('pointerdown', onDown);
      document.addEventListener('visibilitychange', onVisibility);
      loop();
    }
    return () => {
      running = false;
      cancelAnimationFrame(frame);
      ro?.disconnect();
      surface.removeEventListener('pointermove', onMove);
      surface.removeEventListener('pointerleave', onLeave);
      surface.removeEventListener('pointerdown', onDown);
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.remove();
    };
  }, [density, quietZone]);

  return <View ref={host} style={[StyleSheet.absoluteFill, style]} pointerEvents="none" aria-hidden />;
}
