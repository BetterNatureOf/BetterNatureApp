// ═══════════════════════════════════════════════════════════════════════════
//  BETTER NATURE — page renderer
//  Reads window.CONTENT (from content.js) and paints everything dynamically.
//  You only edit content.js to change any text, number, team member, event,
//  testimonial, partner, press article, etc.
// ═══════════════════════════════════════════════════════════════════════════

(function () {
  // Merge any admin overrides saved in localStorage on top of CONTENT defaults.
  // This is how edits from /admin.html show up instantly without rebuilding.
  function deepMerge(a, b) {
    if (Array.isArray(b)) return b;
    if (b && typeof b === 'object') {
      const out = { ...a };
      for (const k in b) out[k] = deepMerge(a?.[k], b[k]);
      return out;
    }
    return b;
  }
  let C = window.CONTENT;
  if (!C) { console.error('CONTENT not loaded'); return; }
  try {
    const overrides = JSON.parse(localStorage.getItem('betternature.content.overrides') || 'null');
    if (overrides) C = deepMerge(C, overrides);
  } catch (e) {}

  const $ = (sel) => document.querySelector(sel);
  const set = (sel, val) => { const el = $(sel); if (el) el.textContent = val; };
  const setHTML = (sel, val) => { const el = $(sel); if (el) el.innerHTML = val; };
  const setHref = (sel, val) => { const el = $(sel); if (el) el.href = val; };

  // ── HERO ────────────────────────────────────────────────────────────
  set('#heroEyebrow', C.hero.eyebrow);
  set('#heroHeadline', C.hero.headline + ' ');
  set('#heroHeadlineItalic', C.hero.headlineItalic);
  set('#heroSub', C.hero.subhead);
  const heroCta1 = $('#heroCta1');
  heroCta1.textContent = C.hero.primaryCta.text;
  heroCta1.href = C.hero.primaryCta.href;
  const heroCta2 = $('#heroCta2');
  heroCta2.textContent = C.hero.secondaryCta.text;
  heroCta2.href = C.hero.secondaryCta.href;

  // Ticker (duplicate for seamless loop)
  const tickerItems = C.hero.tickerStats.map(s =>
    `<span class="ticker__item"><span class="ticker__value">${s.value}</span><span class="ticker__label">${s.label}</span></span><span class="ticker__dot">●</span>`
  ).join('');
  setHTML('#tickerTrack', tickerItems + tickerItems);

  // ── MISSION ─────────────────────────────────────────────────────────
  set('#missionEyebrow', C.mission.eyebrow);
  set('#missionTitle', C.mission.title);
  set('#missionBody', C.mission.body);
  setHTML('#pillars', C.mission.pillars.map(p => `
    <div class="pillar reveal">
      <div class="pillar__number">${p.number}</div>
      <h3 class="pillar__title">${p.title}</h3>
      <p class="pillar__body">${p.body}</p>
    </div>
  `).join(''));

  // ── IMPACT ──────────────────────────────────────────────────────────
  set('#impactEyebrow', C.impact.eyebrow);
  set('#impactTitle', C.impact.title);
  setHTML('#impactGrid', C.impact.stats.map(s => `
    <div class="stat reveal">
      <div class="stat__value">${s.value}</div>
      <div class="stat__label">${s.label}</div>
      <div class="stat__sub">${s.sublabel}</div>
    </div>
  `).join(''));

  // ── PROGRAMS ────────────────────────────────────────────────────────
  set('#programsEyebrow', C.programs.eyebrow);
  set('#programsTitle', C.programs.title);

  const icons = {
    iris: '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="32" cy="28" r="12"/><path d="M20 28 C 20 20, 44 20, 44 28"/><path d="M16 42 L 48 42 L 44 56 L 20 56 Z"/></svg>',
    evergreen: '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M32 8 L 20 24 L 26 24 L 16 40 L 24 40 L 14 56 L 50 56 L 40 40 L 48 40 L 38 24 L 44 24 Z"/><path d="M32 56 L 32 62"/></svg>',
    hydro: '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M32 6 C 20 24, 16 34, 16 42 a 16 16 0 0 0 32 0 C 48 34, 44 24, 32 6 Z"/><path d="M24 42 a 8 8 0 0 0 8 8"/></svg>',
  };

  setHTML('#programsList', C.programs.items.map((p, i) => `
    <div class="program reveal ${i % 2 === 1 ? 'program--reverse' : ''}">
      <div class="program__inner">
        <div class="program__code">${p.code}</div>
        <h3 class="program__title">${p.title}</h3>
        <p class="program__body">${p.body}</p>
        <div class="program__stats">
          ${p.stats.map(s => `
            <div>
              <div class="program__stat-value">${s.value}</div>
              <div class="program__stat-label">${s.label}</div>
            </div>
          `).join('')}
        </div>
        <a href="${p.cta.href}" class="btn btn--forest">${p.cta.text}</a>
      </div>
      <div class="program__visual program__visual--${p.key}">
        ${icons[p.key] || ''}
      </div>
    </div>
  `).join(''));

  // ── FOOD INSECURITY ─────────────────────────────────────────────────
  set('#insecurityEyebrow', C.insecurity.eyebrow);
  set('#insecurityTitle', C.insecurity.title);
  set('#insecurityBody', C.insecurity.body);
  setHTML('#insecurityStats', C.insecurity.stats.map(s => `
    <div class="insecurity__stat">
      <div class="insecurity__stat-v">${s.value}</div>
      <div class="insecurity__stat-l">${s.label}</div>
    </div>
  `).join(''));

  // ── HOW IT WORKS ────────────────────────────────────────────────────
  set('#howEyebrow', C.howItWorks.eyebrow);
  set('#howTitle', C.howItWorks.title);

  const howTabs = $('#howTabs');
  const howContent = $('#howContent');
  const renderTrack = (idx) => {
    const t = C.howItWorks.tracks[idx];
    howContent.innerHTML = `
      <div class="how__tagline">${t.tagline}</div>
      <div class="how__steps">
        ${t.steps.map(s => `
          <div class="how__step">
            <div class="how__step-num">${s.num}</div>
            <div class="how__step-title">${s.title}</div>
            <div class="how__step-body">${s.body}</div>
          </div>
        `).join('')}
      </div>
      <a href="${t.cta.href}" class="btn btn--pink btn--lg">${t.cta.text}</a>
    `;
    howTabs.querySelectorAll('.how__tab').forEach((tab, i) => {
      tab.classList.toggle('is-active', i === idx);
    });
  };
  howTabs.innerHTML = C.howItWorks.tracks.map((t, i) =>
    `<button class="how__tab ${i === 0 ? 'is-active' : ''}" data-idx="${i}">${t.label}</button>`
  ).join('');
  howTabs.querySelectorAll('.how__tab').forEach((tab, i) => {
    tab.addEventListener('click', () => renderTrack(i));
  });
  renderTrack(0);

  // ── CHAPTERS ────────────────────────────────────────────────────────
  set('#chaptersEyebrow', C.chapters.eyebrow);
  set('#chaptersTitle', C.chapters.title);
  set('#chaptersBody', C.chapters.body);
  setHTML('#chaptersGrid', C.chapters.featured.map(ch => `
    <div class="chapter reveal">
      <div class="chapter__city">${ch.city}</div>
      <div class="chapter__state">${ch.state}</div>
      <div class="chapter__meta">
        <span>President: ${ch.president}</span>
        <span class="chapter__members">${ch.members} members</span>
      </div>
    </div>
  `).join(''));
  $('#startChapterBtn').href = C.chapters.startChapterUrl;

  // ── PARTNERS ────────────────────────────────────────────────────────
  set('#partnersEyebrow', C.partners.eyebrow);
  set('#partnersTitle', C.partners.title);
  set('#partnersBody', C.partners.body);

  const partnerLogos = C.partners.logos.map(name => `<span class="partner-logo">${name}</span>`).join('');
  setHTML('#partnerLogos', partnerLogos + partnerLogos);

  set('#pitchTitle', C.partners.pitch.title);
  set('#pitchBody', C.partners.pitch.body);
  const pitchCta = $('#pitchCta');
  pitchCta.textContent = C.partners.pitch.cta.text;
  pitchCta.href = C.partners.pitch.cta.href;

  // ── TESTIMONIALS ────────────────────────────────────────────────────
  setHTML('#testimonialsGrid', C.testimonials.map(t => `
    <div class="testimonial reveal">
      <div class="testimonial__quote">${t.quote}</div>
      <div class="testimonial__attr">
        <div class="testimonial__name">${t.name}</div>
        <div class="testimonial__role">${t.role}${t.city ? ' · ' + t.city : ''}</div>
      </div>
    </div>
  `).join(''));

  // ── TEAM ────────────────────────────────────────────────────────────
  set('#teamEyebrow', C.team.eyebrow);
  set('#teamTitle', C.team.title);
  set('#teamBody', C.team.body);
  setHTML('#teamGrid', C.team.members.map(m => `
    <div class="member reveal">
      <div class="member__photo" ${m.photo ? 'data-has-photo="true"' : ''}>
        ${m.photo ? `<img src="${m.photo}" alt="${m.name}" />` : (m.name.trim()[0] || '—')}
      </div>
      <div class="member__name">${m.name}</div>
      <div class="member__role">${m.role}</div>
      ${m.city ? `<div class="member__city">${m.city}</div>` : ''}
    </div>
  `).join(''));

  // ── EVENTS ──────────────────────────────────────────────────────────
  const fmtDate = (iso) => {
    const d = new Date(iso);
    const m = d.toLocaleString('en', { month: 'short' }).toUpperCase();
    return { month: m, day: String(d.getDate()).padStart(2, '0'), year: d.getFullYear() };
  };
  setHTML('#eventsList', C.events.map(ev => {
    const d = fmtDate(ev.date);
    const cls = (ev.type || '').toLowerCase();
    return `
      <a href="${ev.href || '#'}" class="event reveal">
        <div class="event__date">${d.month} ${d.day}<small>${d.year} · ${ev.time}</small></div>
        <div>
          <div class="event__title">${ev.title}</div>
          <div class="event__meta">${ev.chapter} chapter</div>
        </div>
        <span class="event__tag event__tag--${cls}">${ev.type}</span>
        <span class="event__cta">RSVP →</span>
      </a>
    `;
  }).join(''));

  // ── PRESS ───────────────────────────────────────────────────────────
  set('#pressEyebrow', C.press.eyebrow);
  set('#pressTitle', C.press.title);
  setHTML('#pressGrid', C.press.articles.map(a => {
    const d = fmtDate(a.date);
    return `
      <a class="press-card reveal" href="${a.href || '#'}">
        <div class="press-card__date">${d.month} ${d.day}, ${d.year}</div>
        <div class="press-card__outlet">${a.outlet}</div>
        <div class="press-card__title">${a.title}</div>
      </a>
    `;
  }).join(''));
  setHTML('#pressLogos', C.press.pressLogos.map(l => `<span>${l}</span>`).join(''));

  // ── DONATE ──────────────────────────────────────────────────────────
  set('#donateEyebrow', C.donate.eyebrow);
  set('#donateTitle', C.donate.title);
  set('#donateBody', C.donate.body);
  setHTML('#donateTiers', C.donate.tiers.map(t => `
    <div class="tier reveal">
      <div class="tier__amount">${t.amount}</div>
      <div class="tier__impact">${t.impact}</div>
    </div>
  `).join(''));
  const donateCta = $('#donateCta');
  donateCta.textContent = C.donate.cta.text;
  donateCta.href = C.donate.cta.href;

  // ── NEWSLETTER ──────────────────────────────────────────────────────
  set('#newsTitle', C.newsletter.title);
  set('#newsBody', C.newsletter.body);
  $('#newsEmail').placeholder = C.newsletter.placeholder;
  $('#newsCta').textContent = C.newsletter.cta;
  const newsForm = $('#newsForm');
  if (C.newsletter.formAction) {
    newsForm.action = C.newsletter.formAction;
    newsForm.method = 'POST';
  } else {
    newsForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = $('#newsEmail').value;
      if (!email) return;
      const btn = $('#newsCta');
      btn.textContent = '✓ Subscribed';
      btn.disabled = true;
      $('#newsEmail').value = '';
      setTimeout(() => { btn.textContent = C.newsletter.cta; btn.disabled = false; }, 2500);
    });
  }

  // ── FOOTER ──────────────────────────────────────────────────────────
  set('#footerTagline', C.brand.tagline);
  const fe = $('#footerEmail');
  fe.textContent = C.brand.email;
  fe.href = 'mailto:' + C.brand.email;
  $('#year').textContent = new Date().getFullYear();

  // Social icons (inline SVGs, links from CONTENT)
  const social = [
    { href: C.brand.instagram, svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="18" height="18"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="0.8" fill="currentColor"/></svg>', label: 'Instagram' },
    { href: C.brand.twitter, svg: '<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M18.244 2H21.5l-7.5 8.57L22.5 22h-6.5l-5.1-6.66L5.1 22H1.84l8-9.14L1.5 2h6.66l4.6 6.09L18.244 2zm-2.28 18h1.8L8.1 4H6.2l9.764 16z"/></svg>', label: 'X' },
    { href: C.brand.facebook, svg: '<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M13 22v-8h3l.5-4H13V7.5c0-1.15.3-2 2-2h2V2.1c-.5-.1-1.6-.2-2.8-.2-2.8 0-4.7 1.7-4.7 4.8V10H7v4h2.5v8H13z"/></svg>', label: 'Facebook' },
  ].filter(s => s.href);
  setHTML('#footerSocial', social.map(s => `<a href="${s.href}" aria-label="${s.label}" target="_blank" rel="noreferrer">${s.svg}</a>`).join(''));

  // ══════════════════════════ INTERACTIONS ══════════════════════════

  // Sticky nav shadow on scroll
  const nav = $('#nav');
  const updateNav = () => nav.classList.toggle('is-scrolled', window.scrollY > 20);
  updateNav();
  window.addEventListener('scroll', updateNav, { passive: true });

  // Mobile menu toggle
  const burger = $('#burger');
  burger.addEventListener('click', () => nav.classList.toggle('is-open'));
  document.querySelectorAll('.nav__links a').forEach(a => {
    a.addEventListener('click', () => nav.classList.remove('is-open'));
  });

  // Scroll reveal
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('is-in');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -50px 0px' });
  document.querySelectorAll('.reveal').forEach(el => io.observe(el));

  // Smooth scroll w/ nav offset
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href');
      if (id === '#' || id.length < 2) return;
      const tgt = document.querySelector(id);
      if (!tgt) return;
      e.preventDefault();
      const top = tgt.getBoundingClientRect().top + window.scrollY - 70;
      window.scrollTo({ top, behavior: 'smooth' });
    });
  });
})();
