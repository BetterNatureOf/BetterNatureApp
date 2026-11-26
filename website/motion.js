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
    $$('.nav__quick a').forEach(a => { const active = !!current && a.getAttribute('href') === current.getAttribute('href'); a.classList.toggle('is-active', active); if (active) a.setAttribute('aria-current','location'); else a.removeAttribute('aria-current'); });
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
    if (hero?.dataset.editorial === 'true') return;
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

  // Cards use CSS feedback; avoid pointer-driven 3D tilt and glare.

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

  // Keep the native pointer for familiar, predictable navigation.

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
    enhanceCounters();
    enhanceTabs();
    enhanceParallax();
  }
  let pending = false;
  new MutationObserver(() => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; enhance(); });
  }).observe(document.querySelector('main') || document.body, { childList: true, subtree: true, characterData: true });
  enhance();
})();
