// Motion layer for the marketing site (pairs with motion.css).
//
// Content on this page is rendered late (app.js waits on Firestore before
// painting, live-stats.js rewrites numbers after that), so nothing here
// assumes the DOM is ready. A MutationObserver re-runs `enhance()` whenever
// sections are (re)rendered and each helper marks what it has already done.
//
//   • scroll progress bar, nav scrollspy, the nav's "More" menu
//   • hero: tagline in three looks (one per program), drawn underline,
//     cursor spotlight, drifting shapes, falling petals, parallax photos
//   • Apple-style scroll: titles rise out of a blur, the mission line
//     fills in word by word as you scroll, program cards zoom into place
//   • cards tilt in 3D with a glare that follows the cursor
//   • liquid-glass surfaces catch a highlight under the pointer
//   • impact numbers count up (again, when live stats arrive)
//   • an iPad-style pointer: a pink glass bubble that wraps buttons and
//     links, becomes an I-beam over text and underlines the hovered word
//   • tabs get a sliding indicator; ticker speeds up with scroll velocity
//
// prefers-reduced-motion: only the progress bar, scrollspy and the More
// menu run.

(function () {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  // Motion (motion.dev, the library behind Framer Motion) drives springs and
  // scroll-linked effects. If the CDN is blocked, the CSS/rAF fallbacks below
  // still run, just without the spring physics.
  const M = window.Motion && window.Motion.animate ? window.Motion : null;
  if (M && !reduced) document.documentElement.classList.add('mx-motion');
  const SPRING = M ? { type: M.spring, stiffness: 260, damping: 22, mass: 0.9 } : null;

  // ─── Scroll progress + scrollspy ──────────────────────────────────
  const bar = document.createElement('div');
  bar.className = 'mx-progress';
  bar.setAttribute('aria-hidden', 'true');
  document.body.appendChild(bar);

  const navLinks = $$('#navLinks a[href^="#"]');
  const navEl = $('#nav');
  const DARK_UNDER_NAV = '.impact, .donate, .signup, .bnmap__surface, .footer, .ticker';
  const more = $('.nav__more');
  const moreBtn = $('#navMoreBtn');

  // "More" menu: click/tap or hover to open; Escape, outside click or
  // picking an item closes it.
  if (more && moreBtn) {
    let hoverTimer = 0;
    const setOpen = (open) => {
      more.classList.toggle('is-open', open);
      moreBtn.setAttribute('aria-expanded', String(open));
    };
    moreBtn.addEventListener('click', (e) => { e.stopPropagation(); setOpen(!more.classList.contains('is-open')); });
    if (finePointer) {
      more.addEventListener('pointerenter', () => { clearTimeout(hoverTimer); setOpen(true); });
      more.addEventListener('pointerleave', () => { hoverTimer = setTimeout(() => setOpen(false), 220); });
    }
    document.addEventListener('click', (e) => { if (!more.contains(e.target)) setOpen(false); });
    more.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && more.classList.contains('is-open')) { setOpen(false); moreBtn.focus(); }
    });
    $$('a', more).forEach((a) => a.addEventListener('click', () => setOpen(false)));
  }
  let lastY = window.scrollY;
  let velocity = 0;

  function onScroll() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.setProperty('--mx-progress', max > 0 ? (window.scrollY / max).toFixed(4) : 0);

    const line = window.innerHeight * 0.35;
    // The section whose top most recently passed the reading line wins
    // (nav order no longer matches page order, so compare positions).
    let current = null, best = -Infinity;
    navLinks.forEach((a) => {
      const sec = document.getElementById(a.getAttribute('href').slice(1));
      if (!sec || sec.offsetParent === null) return;
      const top = sec.getBoundingClientRect().top;
      if (top <= line && top > best) { best = top; current = a; }
    });
    navLinks.forEach((a) => a.classList.toggle('is-active', a === current));
    if (moreBtn) moreBtn.classList.toggle('is-active', !!(current && current.closest('.nav__moreMenu')));

    // Adaptive nav: is a dark section under the bar right now?
    if (navEl) {
      const r = navEl.getBoundingClientRect();
      const under = document.elementsFromPoint(window.innerWidth / 2, r.bottom + 2)
        .find((el) => !navEl.contains(el) && !el.classList.contains('mx-progress'));
      navEl.classList.toggle('nav--on-dark', !!(under && under.closest(DARK_UNDER_NAV)));
    }

    velocity = Math.abs(window.scrollY - lastY);
    lastY = window.scrollY;
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  if (reduced) return;

  // ─── Helpers ──────────────────────────────────────────────────────
  function splitWords(el) {
    if (el.dataset.mxSplit === el.textContent) return false;
    // Line breaks (<br>) in CMS text count as spaces, so "people.<br>Plant"
    // splits into two words instead of "people.Plant".
    const copy = el.cloneNode(true);
    copy.querySelectorAll('br').forEach((b) => b.replaceWith(' '));
    const text = copy.textContent;
    if (!text.trim()) return false;
    el.innerHTML = '';
    let i = 0;
    text.split(/(\s+)/).forEach((part) => {
      if (!part) return;
      if (/^\s+$/.test(part)) { el.appendChild(document.createTextNode(' ')); return; }
      const w = document.createElement('span');
      w.className = 'mx-w';
      const inner = document.createElement('span');
      inner.style.setProperty('--i', i++);
      inner.textContent = part;
      w.appendChild(inner);
      el.appendChild(w);
    });
    el.dataset.mxSplit = el.textContent;
    el.setAttribute('aria-label', text.trim());
    el.classList.add('mx-split');
    return true;
  }

  // Words spring up out of their mask one after another.
  function revealWords(el, delay = 0) {
    el.classList.add('is-split-in', 'is-in');
    if (!M) return;
    const spans = el.querySelectorAll('.mx-w > span');
    if (!spans.length) return;
    const h = spans[0].offsetHeight || 60;
    const stagger = M.stagger(0.06, { startDelay: delay });
    M.animate(spans, { y: [h * 1.05, 0], rotate: [4, 0] }, { ...SPRING, stiffness: 180, damping: 18, delay: stagger });
    // Apple-style: each word also comes into focus out of a blur
    M.animate(spans, { opacity: [0, 1], filter: ['blur(10px)', 'blur(0px)'] }, { duration: 0.9, ease: [0.25, 0.1, 0.25, 1], delay: stagger });
  }

  const inView = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      if (e.target.classList.contains('mx-split')) revealWords(e.target);
      else e.target.classList.add('is-split-in', 'is-in');
      inView.unobserve(e.target);
    });
  }, { threshold: 0.2, rootMargin: '0px 0px -60px 0px' });

  // ─── Hero ─────────────────────────────────────────────────────────
  const hero = $('.hero');
  const h1 = $('.hero__h1');
  const headline = $('#heroHeadline');
  const italic = $('#heroHeadlineItalic');

  // Each sentence of the tagline gets its own look, matched to a program:
  // "Feed people." (IRIS pink, bold sans), "Plant forests." (Evergreen
  // green, upright serif); the italic line is Hydro blue (motion.css).
  function groupPhrases(el) {
    const words = $$('.mx-w', el);
    let n = 1, group = null;
    words.forEach((w) => {
      if (!group) {
        group = document.createElement('span');
        group.className = 'mx-phrase mx-phrase--' + n;
        el.insertBefore(group, w);
      }
      if (group.childNodes.length) group.appendChild(document.createTextNode(' '));
      group.appendChild(w);
      if (/[.!?]$/.test(w.textContent)) { group = null; n = Math.min(n + 1, 2); }
    });
    // the spaces between groups are now inside the groups
    Array.from(el.childNodes).forEach((c) => { if (c.nodeType === 3) el.removeChild(c); });
    el.dataset.mxSplit = el.textContent; // so the observer doesn't split it again
  }

  function enhanceHero() {
    if (headline && splitWords(headline)) {
      groupPhrases(headline);
      // Two frames so the hidden state paints before we release it.
      requestAnimationFrame(() => requestAnimationFrame(() => revealWords(headline, 0.15)));
    }
    if (italic && italic.textContent.trim() && !italic.querySelector('.mx-underline')) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'mx-underline');
      svg.setAttribute('viewBox', '0 0 300 12');
      svg.setAttribute('preserveAspectRatio', 'none');
      svg.setAttribute('aria-hidden', 'true');
      svg.innerHTML = '<path pathLength="1" d="M3 8 C 60 2, 120 11, 180 6 S 270 3, 297 7"/>';
      italic.appendChild(svg);
      setTimeout(() => h1 && h1.classList.add('is-drawn'), 50);
    }
  }

  if (hero && finePointer) {
    const shapes = $$('.hero__shape', hero);
    let raf = 0, tx = 0, ty = 0;
    hero.addEventListener('pointermove', (e) => {
      const r = hero.getBoundingClientRect();
      tx = (e.clientX - r.left) / r.width;
      ty = (e.clientY - r.top) / r.height;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        hero.style.setProperty('--mx', (tx * 100).toFixed(1) + '%');
        hero.style.setProperty('--my', (ty * 100).toFixed(1) + '%');
        const dx = tx - 0.5, dy = ty - 0.5;
        shapes.forEach((s, i) => {
          const k = i === 0 ? 60 : -45;
          s.style.transform = `translate3d(${dx * k}px, ${dy * k}px, 0)`;
        });
        $$('.hero__tile', hero).forEach((t, i) => {
          const depth = 8 + i * 4;
          t.style.setProperty('--px', `${(-dx * depth).toFixed(1)}px`);
          t.style.setProperty('--py', `${(-dy * depth).toFixed(1)}px`);
        });
      });
    });
  }

  // Falling petals + leaves in the hero, in the site's pink and forest.
  if (hero) {
    const canvas = document.createElement('canvas');
    canvas.className = 'mx-petals';
    canvas.setAttribute('aria-hidden', 'true');
    hero.insertBefore(canvas, hero.firstChild.nextSibling);
    const ctx = canvas.getContext('2d');
    const PINK = ['rgba(255,77,141,.55)', 'rgba(255,156,192,.6)', 'rgba(255,229,238,.9)'];
    const LEAF = ['rgba(61,122,103,.45)', 'rgba(42,86,72,.35)'];
    let w = 0, h = 0, dpr = Math.min(2, window.devicePixelRatio || 1), parts = [], running = true;
    let mouse = { x: -999, y: -999 };

    function size() {
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function make(top) {
      const leaf = Math.random() < 0.3;
      return {
        x: Math.random() * w, y: top ? -20 : Math.random() * h,
        vx: (Math.random() - 0.5) * 0.3, vy: 0.3 + Math.random() * 0.5,
        s: leaf ? 7 + Math.random() * 5 : 5 + Math.random() * 5,
        r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.03,
        sw: Math.random() * 6.28, leaf,
        c: leaf ? LEAF[(Math.random() * LEAF.length) | 0] : PINK[(Math.random() * PINK.length) | 0],
      };
    }
    function burst(x, y) {
      for (let i = 0; i < 14; i++) {
        const p = make(false);
        const a = Math.random() * 6.28, sp = 1.5 + Math.random() * 3;
        Object.assign(p, { x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.5, life: 1 });
        parts.push(p);
      }
    }
    function draw() {
      if (!running) return;
      ctx.clearRect(0, 0, w, h);
      parts = parts.filter((p) => p.life === undefined || p.life > 0);
      parts.forEach((p) => {
        p.sw += 0.02;
        // drift away from the cursor
        const dx = p.x - mouse.x, dy = p.y - mouse.y, d2 = dx * dx + dy * dy;
        if (d2 < 9000) { const f = (9000 - d2) / 9000 * 0.6; p.x += dx / Math.sqrt(d2 + 1) * f * 3; p.y += dy / Math.sqrt(d2 + 1) * f * 3; }
        if (p.life !== undefined) { p.vy += 0.05; p.vx *= 0.98; p.life -= 0.012; }
        p.x += p.vx + Math.sin(p.sw) * 0.35;
        p.y += p.vy;
        p.r += p.vr;
        if (p.life === undefined && p.y > h + 20) Object.assign(p, make(true));
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.globalAlpha = p.life !== undefined ? Math.max(0, p.life) : 1;
        ctx.fillStyle = p.c;
        const s = p.s;
        ctx.beginPath();
        if (p.leaf) {
          ctx.moveTo(0, -s); ctx.quadraticCurveTo(s * 0.8, 0, 0, s); ctx.quadraticCurveTo(-s * 0.8, 0, 0, -s);
        } else {
          ctx.moveTo(0, s);
          ctx.bezierCurveTo(s * 0.9, s * 0.4, s * 0.7, -s * 0.8, s * 0.12, -s * 0.7);
          ctx.lineTo(0, -s * 0.45); ctx.lineTo(-s * 0.12, -s * 0.7);
          ctx.bezierCurveTo(-s * 0.7, -s * 0.8, -s * 0.9, s * 0.4, 0, s);
        }
        ctx.fill();
        ctx.restore();
      });
      requestAnimationFrame(draw);
    }
    size();
    const count = window.innerWidth < 700 ? 10 : 20; // fewer petals: a calmer, cleaner top
    for (let i = 0; i < count; i++) parts.push(make(false));
    window.addEventListener('resize', size);
    hero.addEventListener('pointermove', (e) => {
      const r = canvas.getBoundingClientRect();
      mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
    });
    hero.addEventListener('pointerleave', () => { mouse = { x: -999, y: -999 }; });
    hero.addEventListener('click', (e) => {
      if (e.target.closest('a, button')) return;
      const r = canvas.getBoundingClientRect();
      burst(e.clientX - r.left, e.clientY - r.top);
    });
    // Pause while the hero is off screen or the tab is hidden.
    new IntersectionObserver(([e]) => {
      const was = running;
      running = e.isIntersecting && !document.hidden;
      if (running && !was) requestAnimationFrame(draw);
    }).observe(hero);
    document.addEventListener('visibilitychange', () => {
      const was = running;
      running = !document.hidden;
      if (running && !was) requestAnimationFrame(draw);
    });
    requestAnimationFrame(draw);
  }

  // ─── Section titles + eyebrows ────────────────────────────────────
  function enhanceTitles() {
    $$('main h2').forEach((h) => {
      if (h.closest('.newsletter')) return;
      if (h.id === 'missionTitle' && M) {
        if (splitWords(h)) fillOnScroll(h);
        return;
      }
      if (splitWords(h)) inView.observe(h);
    });
    $$('main .eyebrow').forEach((e) => {
      if (e.classList.contains('mx-eyebrow')) return;
      e.classList.add('mx-eyebrow');
      inView.observe(e);
    });
  }

  // Words light up one by one as the line scrolls through the viewport.
  function fillOnScroll(h) {
    h.classList.add('mx-fill', 'is-split-in');
    const spans = $$('.mx-w > span', h);
    M.scroll((p) => {
      const lit = p * (spans.length + 2);
      spans.forEach((sp, i) => { sp.style.opacity = clamp(lit - i, 0.16, 1).toFixed(3); });
    }, { target: h, offset: ['start 0.85', 'end 0.45'] });
  }

  // Program cards zoom into place as they scroll up (Apple product pages).
  function enhancePrograms() {
    if (!M) return;
    $$('.program').forEach((p) => {
      if (p.dataset.mxZoom) return;
      p.dataset.mxZoom = '1';
      p.classList.remove('reveal'); // the scroll animation replaces the fade-in
      M.scroll(M.animate(p, { scale: [0.9, 1], opacity: [0.35, 1] }, { ease: 'linear' }),
        { target: p, offset: ['start end', 'start 0.55'] });
    });
  }

  // ─── Card tilt + glare ────────────────────────────────────────────
  const TILT = '.pillar, .stat, .chapter, .tier, .press-card, .testimonial, .member, .event, .how__step, .getapp__qr, .partners__pitch';
  function enhanceCards() {
    $$(TILT).forEach((c) => c.classList.add('mx-tilt'));
  }
  if (finePointer) {
    let active = null;
    document.addEventListener('pointermove', (e) => {
      const card = e.target.closest && e.target.closest('.mx-tilt');
      if (active && active !== card) reset(active);
      if (!card) return;
      active = card;
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      const strength = r.width > 700 ? 2.5 : 7; // wide cards tilt less
      card.classList.add('is-tilting');
      card.style.setProperty('--ry', ((x - 0.5) * strength).toFixed(2) + 'deg');
      card.style.setProperty('--rx', ((0.5 - y) * strength).toFixed(2) + 'deg');
      card.style.setProperty('--gx', (x * 100).toFixed(1) + '%');
      card.style.setProperty('--gy', (y * 100).toFixed(1) + '%');
      card.style.setProperty('--glare', '1');
    }, { passive: true });
    document.addEventListener('pointerleave', () => active && reset(active));
    function reset(c) {
      c.classList.remove('is-tilting');
      c.style.setProperty('--rx', '0deg');
      c.style.setProperty('--ry', '0deg');
      c.style.setProperty('--glare', '0');
      if (active === c) active = null;
    }
  }

  // Liquid glass: move the specular highlight to wherever the pointer is.
  const GLASS = '.nav, .nav__moreMenu, .hero__eyebrow, .hero__ctas .btn--outline, .impact .stat, .donate .tier, .join__card, .chapters__search';
  if (finePointer) {
    let lastGlass = null;
    document.addEventListener('pointermove', (e) => {
      const g = e.target.closest && e.target.closest(GLASS);
      if (lastGlass && lastGlass !== g) { lastGlass.style.removeProperty('--lx'); lastGlass.style.removeProperty('--ly'); }
      lastGlass = g;
      if (!g) return;
      const r = g.getBoundingClientRect();
      g.style.setProperty('--lx', (e.clientX - r.left) + 'px');
      g.style.setProperty('--ly', (e.clientY - r.top) + 'px');
    }, { passive: true });
  }

  // Spotlight in the dark sections
  if (finePointer) {
    $$('.impact, .donate').forEach((sec) => {
      sec.addEventListener('pointermove', (e) => {
        const r = sec.getBoundingClientRect();
        sec.style.setProperty('--sx', (e.clientX - r.left) + 'px');
        sec.style.setProperty('--sy', (e.clientY - r.top) + 'px');
      }, { passive: true });
    });
  }

  // ─── Number count-up (impact + program stats) ─────────────────────
  // Values are strings like "2,780" or "486,500 gal" or "Launching". We
  // animate the leading number and keep whatever follows it.
  const counted = new WeakMap();
  const countIO = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      countIO.unobserve(e.target);
      runCount(e.target);
    });
  }, { threshold: 0.5 });

  function runCount(el) {
    const raw = el.dataset.mxTarget;
    const m = raw && raw.match(/^([^\d]*)([\d,]+(?:\.\d+)?)(.*)$/s);
    if (!m) return;
    const [, pre, num, post] = m;
    const target = parseFloat(num.replace(/,/g, ''));
    const decimals = (num.split('.')[1] || '').length;
    const start = performance.now();
    const dur = 1400;
    el.classList.add('mx-counting');
    el.classList.remove('mx-landed');
    const fmt = (v) => pre + v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + post;
    const land = () => {
      el.textContent = raw;
      el.classList.remove('mx-counting');
      if (M) M.animate(el, { scale: [1.12, 1] }, { ...SPRING, stiffness: 400, damping: 10 });
      else el.classList.add('mx-landed');
    };
    if (M) {
      M.animate(0, target, {
        duration: 1.6, ease: [0.16, 1, 0.3, 1],
        onUpdate: (v) => { if (el.dataset.mxTarget === raw) el.textContent = fmt(v); },
        onComplete: () => { if (el.dataset.mxTarget === raw) land(); },
      });
      return;
    }
    (function frame(now) {
      if (el.dataset.mxTarget !== raw) return; // replaced mid-flight
      const t = Math.min(1, (now - start) / dur);
      const v = target * (1 - Math.pow(1 - t, 4));
      el.textContent = pre + v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + post;
      if (t < 1) requestAnimationFrame(frame);
      else {
        el.textContent = raw;
        el.classList.remove('mx-counting');
        el.classList.add('mx-landed');
      }
    })(start);
  }

  function enhanceCounters() {
    $$('.stat__value, .program__stat-value').forEach((el) => {
      const text = el.textContent;
      if (el.classList.contains('mx-counting')) return;
      if (counted.get(el) === text) return;
      if (!/\d/.test(text)) { counted.set(el, text); return; }
      counted.set(el, text);
      el.dataset.mxTarget = text;
      const r = el.getBoundingClientRect();
      const visible = r.top < window.innerHeight && r.bottom > 0;
      if (visible && el.dataset.mxSeen) runCount(el); // live numbers arrived while on screen
      else { el.dataset.mxSeen = '1'; countIO.observe(el); }
    });
  }

  // ─── Ripple on press ──────────────────────────────────────────────
  document.addEventListener('pointerdown', (e) => {
    const b = e.target.closest && e.target.closest('.btn, .how__tab, .signup__tab, .tier');
    if (!b) return;
    const r = b.getBoundingClientRect();
    const d = Math.max(r.width, r.height) * 2.2;
    const s = document.createElement('span');
    s.className = 'mx-ripple';
    s.setAttribute('aria-hidden', 'true');
    Object.assign(s.style, { width: d + 'px', height: d + 'px', left: (e.clientX - r.left) + 'px', top: (e.clientY - r.top) + 'px' });
    if (getComputedStyle(b).position === 'static') b.style.position = 'relative';
    b.style.overflow = 'hidden';
    b.appendChild(s);
    setTimeout(() => s.remove(), 750);
  });

  // ─── Tabs: sliding indicator ──────────────────────────────────────
  function enhanceTabs() {
    $$('#howTabs, #signupTabs').forEach((wrap) => {
      if (!wrap.children.length) return;
      let ind = wrap.querySelector('.mx-tab-ind');
      if (!ind) {
        ind = document.createElement('span');
        ind.className = 'mx-tab-ind';
        ind.setAttribute('aria-hidden', 'true');
        wrap.prepend(ind);
        wrap.classList.add('mx-has-ind');
        wrap.addEventListener('click', () => requestAnimationFrame(() => place(wrap)));
      }
      place(wrap);
    });
  }
  function place(wrap) {
    const ind = wrap.querySelector('.mx-tab-ind');
    const act = wrap.querySelector('button.is-active');
    if (!ind || !act) return;
    const underline = wrap.id === 'howTabs';
    const to = {
      x: act.offsetLeft,
      y: underline ? act.offsetTop + act.offsetHeight - 2 : act.offsetTop,
      width: act.offsetWidth + 'px',
      height: underline ? '2px' : act.offsetHeight + 'px',
    };
    if (M && ind.dataset.placed) { M.animate(ind, to, { ...SPRING, stiffness: 320, damping: 26 }); return; }
    ind.dataset.placed = '1';
    if (M) { M.animate(ind, to, { duration: 0 }); return; }
    ind.style.width = to.width;
    ind.style.height = to.height;
    ind.style.transform = `translate(${to.x}px, ${to.y}px)`;
  }
  window.addEventListener('resize', () => $$('.mx-has-ind').forEach(place));
  window.addEventListener('load', () => $$('.mx-has-ind').forEach(place));
  if (document.fonts) document.fonts.ready.then(() => $$('.mx-has-ind').forEach(place));

  // ─── Ticker: scroll velocity speeds it up ─────────────────────────
  const track = $('#tickerTrack');
  if (track && track.getAnimations) {
    let rate = 1;
    (function tick() {
      const anim = track.getAnimations()[0];
      if (anim) {
        const target = 1 + Math.min(6, velocity * 0.25);
        rate += (target - rate) * 0.08;
        if (!track.matches(':hover')) anim.playbackRate = rate;
      }
      velocity *= 0.9;
      requestAnimationFrame(tick);
    })();
  }

  // ─── iPad-style pointer ───────────────────────────────────────────
  // The system cursor is hidden (mouse/trackpad only) and replaced by a
  // pink liquid-glass bubble with four looks:
  //   dot   — open space: a small bubble that trails the pointer
  //   snap  — buttons, links, tabs: it grows into a glass highlight that
  //           wraps the control, which leans slightly toward the pointer
  //   lift  — solid buttons: the bubble melts away and the button rises
  //   text  — over words: an I-beam, and the hovered word is underlined
  // Form fields, the map and the donation iframe keep the normal cursor.
  if (finePointer) {
    const root = document.documentElement;
    root.classList.add('mx-pointer-on');
    const bub = document.createElement('div');
    bub.className = 'mx-pointer';
    bub.setAttribute('aria-hidden', 'true');
    const word = document.createElement('div');
    word.className = 'mx-word';
    word.setAttribute('aria-hidden', 'true');
    document.body.append(bub, word);

    const SNAP = 'a, button, [role="button"], .how__tab, .signup__tab, summary';
    const LIFT = '.btn--pink, .btn--forest';
    const NATIVE = 'input, textarea, select, iframe, .bnmap__root, [contenteditable="true"]';
    const TEXT = 'p, li, h1, h2, h3, h4, blockquote, figcaption, small, label, .eyebrow, .stat__label, .stat__sub, .stat__value, .pillar__body, .pillar__title, .how__tagline, .how__step-title, .how__step-body, .testimonial__quote, .member__role, .member__name, .chapter__meta, .program__body, .program__stat-label, .event__meta, .press-card__title, .footer__bar';
    const DARK = '.impact, .donate, .signup, .ticker, .footer';

    // spring state: position, size, radius
    const cur = { x: -100, y: -100, w: 22, h: 22, r: 11 };
    const vel = { x: 0, y: 0, w: 0, h: 0, r: 0 };
    const tgt = { ...cur };
    const wCur = { x: 0, y: 0, w: 0 }, wTgt = { x: 0, y: 0, w: 0 };
    let px = -100, py = -100, mode = 'dot', snapEl = null, liftEl = null, wordOn = false, pending = false;

    const caretAt = (x, y) => {
      if (document.caretRangeFromPoint) {
        const r = document.caretRangeFromPoint(x, y);
        return r && { node: r.startContainer, offset: r.startOffset };
      }
      if (document.caretPositionFromPoint) {
        const c = document.caretPositionFromPoint(x, y);
        return c && { node: c.offsetNode, offset: c.offset };
      }
      return null;
    };
    // The word under (x, y), or null if the pointer isn't actually on one.
    function wordAt(x, y) {
      const c = caretAt(x, y);
      if (!c || !c.node || c.node.nodeType !== 3) return null;
      const t = c.node.textContent;
      let a = c.offset, b = c.offset;
      while (a > 0 && /[\w’'%,.$₂-]/.test(t[a - 1])) a--;
      while (b < t.length && /[\w’'%,.$₂-]/.test(t[b])) b++;
      while (b > a && /[,.]/.test(t[b - 1])) b--; // don't underline trailing punctuation
      if (b <= a) return null;
      const range = document.createRange();
      range.setStart(c.node, a);
      range.setEnd(c.node, b);
      const r = range.getBoundingClientRect();
      if (!r.width || x < r.left - 2 || x > r.right + 2 || y < r.top - 2 || y > r.bottom + 2) return null;
      return r;
    }

    function setLift(el) {
      if (liftEl === el) return;
      if (liftEl) {
        liftEl.classList.remove('mx-lifted');
        if (M) M.animate(liftEl, { scale: 1, x: 0, y: 0 }, { ...SPRING, stiffness: 380, damping: 14 });
      }
      liftEl = el;
      if (el) {
        el.classList.add('mx-lifted');
        if (M) M.animate(el, { scale: 1.06 }, { ...SPRING, stiffness: 380, damping: 16 });
      }
    }
    function release(el) {
      if (el && M) M.animate(el, { x: 0, y: 0 }, { ...SPRING, stiffness: 380, damping: 12 });
    }

    function update() {
      pending = false;
      const t = document.elementFromPoint(px, py);
      if (!t) return;
      const native = t.closest(NATIVE);
      bub.classList.toggle('is-hidden', !!native);
      bub.classList.toggle('is-dark', !!t.closest(DARK));
      word.classList.toggle('is-dark', !!t.closest(DARK));

      const ctl = native ? null : t.closest(SNAP);
      let next = 'dot', el = null;
      if (ctl) {
        const r = ctl.getBoundingClientRect();
        // Big link areas (whole cards) stay a bubble; small controls snap.
        if (r.width <= 420 && r.height <= 120) { el = ctl; next = ctl.matches(LIFT) ? 'lift' : 'snap'; }
      }
      let wr = null;
      if (!native && !el && t.closest(TEXT)) { wr = wordAt(px, py); if (wr) next = 'text'; }

      if (snapEl && snapEl !== el) release(snapEl);
      snapEl = next === 'snap' || next === 'lift' ? el : null;
      setLift(next === 'lift' ? el : null);
      mode = next;
      bub.classList.toggle('is-snap', mode === 'snap');
      bub.classList.toggle('is-lift', mode === 'lift');
      bub.classList.toggle('is-text', mode === 'text');

      if (snapEl) {
        const r = snapEl.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const dx = px - cx, dy = py - cy;
        // highlight wraps the control and leans a little toward the pointer
        Object.assign(tgt, {
          x: cx + dx * 0.12, y: cy + dy * 0.12,
          w: r.width + 16, h: r.height + 10,
          r: Math.min((r.height + 10) / 2, parseFloat(getComputedStyle(snapEl).borderTopLeftRadius) + 6 || 14),
        });
        if (M) M.animate(snapEl, { x: clamp(dx * 0.1, -6, 6), y: clamp(dy * 0.15, -4, 4) }, { duration: 0.18, ease: 'easeOut' });
        bub.style.setProperty('--lx', (px - (tgt.x - tgt.w / 2)) + 'px');
        bub.style.setProperty('--ly', (py - (tgt.y - tgt.h / 2)) + 'px');
      } else if (mode === 'text') {
        const lh = Math.max(14, Math.min(64, wr.height));
        Object.assign(tgt, { x: px, y: wr.top + wr.height / 2, w: 2.5, h: lh, r: 2 });
      } else {
        Object.assign(tgt, { x: px, y: py, w: 22, h: 22, r: 11 });
      }

      wordOn = mode === 'text';
      if (wordOn) {
        const jump = !word.classList.contains('is-on');
        Object.assign(wTgt, { x: wr.left, y: wr.bottom + 1, w: wr.width });
        if (jump) Object.assign(wCur, { x: wr.left + wr.width / 2, y: wTgt.y, w: 0 });
      }
      word.classList.toggle('is-on', wordOn);
    }

    document.addEventListener('pointermove', (e) => {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      px = e.clientX; py = e.clientY;
      bub.classList.add('is-on');
      if (!pending) { pending = true; requestAnimationFrame(update); }
    }, { passive: true });
    // keep the highlight glued to its control while the page scrolls
    window.addEventListener('scroll', () => { if (!pending) { pending = true; requestAnimationFrame(update); } }, { passive: true });
    document.addEventListener('pointerleave', () => { bub.classList.remove('is-on'); word.classList.remove('is-on'); });
    document.addEventListener('pointerdown', () => { bub.style.scale = '0.86'; });
    document.addEventListener('pointerup', () => { bub.style.scale = ''; });

    (function frame() {
      // critically-damped-ish spring: snappy but soft, like iPadOS
      const k = mode === 'dot' ? 0.32 : 0.22, d = 0.62;
      for (const key in cur) {
        vel[key] = (vel[key] + (tgt[key] - cur[key]) * k) * d;
        cur[key] += vel[key];
      }
      bub.style.width = cur.w.toFixed(1) + 'px';
      bub.style.height = cur.h.toFixed(1) + 'px';
      bub.style.borderRadius = Math.max(1, cur.r).toFixed(1) + 'px';
      bub.style.transform = `translate3d(${(cur.x - cur.w / 2).toFixed(1)}px, ${(cur.y - cur.h / 2).toFixed(1)}px, 0)`;
      if (wordOn) {
        wCur.x += (wTgt.x - wCur.x) * 0.3;
        wCur.y += (wTgt.y - wCur.y) * 0.3;
        wCur.w += (wTgt.w - wCur.w) * 0.3;
        word.style.width = wCur.w.toFixed(1) + 'px';
        word.style.transform = `translate3d(${wCur.x.toFixed(1)}px, ${wCur.y.toFixed(1)}px, 0)`;
      }
      requestAnimationFrame(frame);
    })();
  }

  // ─── Scroll-linked parallax (Motion `scroll`, rAF fallback) ───────
  // Hero copy lifts and fades as you scroll past it; photos lag behind.
  if (M && hero) {
    const copy = $('.hero__copy', hero), media = $('.hero__media', hero);
    const opts = { target: hero, offset: ['start start', 'end start'] };
    if (copy) M.scroll(M.animate(copy, { y: [0, -140], opacity: [1, 1, 0.15] }, { ease: 'linear' }), opts);
    if (media) M.scroll(M.animate(media, { y: [0, -50], scale: [1, 0.94] }, { ease: 'linear' }), opts);
  }
  // Program visuals drift against the scroll.
  function enhanceParallax() {
    if (!M) return;
    $$('.program__visual').forEach((v) => {
      if (v.dataset.mxPar) return;
      v.dataset.mxPar = '1';
      M.scroll(M.animate(v, { y: [50, -50] }, { ease: 'linear' }), { target: v, offset: ['start end', 'end start'] });
    });
  }
  function parallax() {
    if (M) return;
    $$('.program__visual').forEach((v) => {
      const r = v.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) return;
      const p = (r.top + r.height / 2 - window.innerHeight / 2) / window.innerHeight;
      v.style.transform = `translateY(${(p * -30).toFixed(1)}px)`;
    });
  }
  window.addEventListener('scroll', () => requestAnimationFrame(parallax), { passive: true });

  // ─── Run now and whenever content re-renders ──────────────────────
  function enhance() {
    enhanceHero();
    enhanceTitles();
    enhanceCards();
    enhanceCounters();
    enhanceTabs();
    enhanceParallax();
    enhancePrograms();
  }
  let pending = false;
  new MutationObserver(() => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; enhance(); });
  }).observe(document.querySelector('main') || document.body, { childList: true, subtree: true, characterData: true });
  enhance();
})();
