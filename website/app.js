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

  // Referral capture — first visitor with ?ref=CODE has it stashed so it
  // survives the click into signup (or the click into the web app build,
  // where authFirebase reads it back via readPendingReferralCode()).
  try {
    const refCode = new URL(window.location.href).searchParams.get('ref');
    if (refCode) localStorage.setItem('bn_ref', refCode.trim().toUpperCase());
  } catch (e) {}
  try {
    const overrides = JSON.parse(localStorage.getItem('betternature.content.overrides') || 'null');
    if (overrides) C = deepMerge(C, overrides);
  } catch (e) {}

  const $ = (sel) => document.querySelector(sel);
  const set = (sel, val) => { const el = $(sel); if (el) el.textContent = val; };

  // ── SECTION VISIBILITY ──────────────────────────────────────────────
  // Hide sections turned off in admin. Also hides nav links that point to them.
  if (C.sections) {
    Object.entries(C.sections).forEach(([key, on]) => {
      if (on) return;
      const sec = document.getElementById(key);
      if (sec) sec.style.display = 'none';
      document.querySelectorAll(`.nav__links a[href="#${key}"]`).forEach(a => a.style.display = 'none');
    });
  }

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

  // Hero media collage (trees, fresh water, produce crates)
  if (C.hero.media && C.hero.media.length) {
    setHTML('#heroMedia', C.hero.media.map((m, i) =>
      `<figure class="hero__tile hero__tile--${i + 1}"><img src="${m.src}" alt="${m.alt || ''}" loading="lazy" /></figure>`
    ).join(''));
  }

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

  // ── IMPACT MAP ──────────────────────────────────────────────────────
  if (window.IMPACT_MAP && window.L) {
    const IM = window.IMPACT_MAP;
    set('#impactmapEyebrow', IM.copy.eyebrow);
    set('#impactmapTitle', IM.copy.title);
    set('#impactmapBody', IM.copy.body);

    // Legend pills
    const active = new Set(IM.layers.filter(l => l.defaultOn).map(l => l.key));
    setHTML('#impactmapLegend', IM.layers.map(l => `
      <button type="button" class="imlegend ${active.has(l.key) ? 'is-on' : ''}" data-layer="${l.key}" style="--im-color:${l.color}">
        <span class="imlegend__dot"></span>${l.label}
      </button>
    `).join(''));

    // Leaflet map
    const map = L.map('impactmapCanvas', {
      center: [38.5, -96.0], zoom: 4, scrollWheelZoom: false, zoomControl: true,
    });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap · © CARTO', subdomains: 'abcd', maxZoom: 18,
    }).addTo(map);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd', maxZoom: 18, pane: 'shadowPane',
    }).addTo(map);

    const layerByKey = Object.fromEntries(IM.layers.map(l => [l.key, L.layerGroup()]));
    const colorByKey = Object.fromEntries(IM.layers.map(l => [l.key, l.color]));

    const radiusFor = (p) => {
      if (p.kind === 'chapter') return 10 + Math.min(14, (p.members || 0) / 8);
      if (p.kind === 'gap')     return 9 + Math.min(14, (p.insecurity || 15) - 14);
      if (p.kind === 'partner') return 6;
      if (p.kind === 'planting')return 7 + Math.min(6, (p.trees || 0) / 250);
      if (p.kind === 'cleanup') return 7 + Math.min(6, (p.gallons || 0) / 2000);
      return 7;
    };

    const fmtNum = (n) => n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'K' : String(n);
    const renderSelected = (p) => {
      const el = $('#impactmapSelected');
      if (!p) { el.innerHTML = '<div class="impactmap__selectedHint">Click any pin on the map to see the story.</div>'; return; }
      if (p.kind === 'chapter') {
        const ch = C.chapters.featured[p.chapterIndex];
        el.innerHTML = `
          <div class="imsel__kind" style="color:${colorByKey.chapter}">Chapter</div>
          <h4>${p.city}, ${p.state}</h4>
          <div class="imsel__stats">
            <span><strong>${p.members}</strong> members</span>
            <span><strong>${fmtNum(p.meals)}</strong> meals</span>
            <span><strong>${fmtNum(p.trees)}</strong> trees</span>
            <span><strong>${fmtNum(p.gallons)}</strong> gal cleaned</span>
          </div>
          <button class="btn btn--forest" data-open-chapter="${p.chapterIndex}">See the team →</button>
          ${ch && ch.instagram ? `<a class="imsel__link" href="${ch.instagram}" target="_blank" rel="noreferrer">@chapter on Instagram ↗</a>` : ''}
        `;
        const btn = el.querySelector('[data-open-chapter]');
        if (btn) btn.addEventListener('click', () => openChapter(Number(btn.dataset.openChapter)));
      } else if (p.kind === 'gap') {
        el.innerHTML = `
          <div class="imsel__kind" style="color:${colorByKey.gap}">The gap</div>
          <h4>${p.city}, ${p.state}</h4>
          <div class="imsel__stats">
            <span><strong>${p.insecurity}%</strong> food insecure</span>
            <span><strong>${fmtNum(p.population)}</strong> people</span>
            <span class="imsel__warn">No chapter yet</span>
          </div>
          <p class="imsel__body">We have no chapter here — yet. If you're a student in ${p.city}, you can be the one that changes that. We give you the playbook, the insurance, the partner intros.</p>
          <a class="btn btn--pink" href="#signup" data-prefill-city="${p.city}, ${p.state}">Start a chapter in ${p.city} →</a>
        `;
      } else if (p.kind === 'partner') {
        el.innerHTML = `
          <div class="imsel__kind" style="color:${colorByKey.partner}">Partner kitchen</div>
          <h4>${p.name}</h4>
          <div class="imsel__sub">${p.city}, ${p.state}</div>
          <div class="imsel__stats"><span><strong>${fmtNum(p.meals)}</strong> meals rescued to date</span></div>
        `;
      } else if (p.kind === 'planting') {
        el.innerHTML = `
          <div class="imsel__kind" style="color:${colorByKey.planting}">Tree planting</div>
          <h4>${p.site}</h4>
          <div class="imsel__sub">${p.city}, ${p.state} · ${p.date}</div>
          <div class="imsel__stats"><span><strong>${fmtNum(p.trees)}</strong> native trees planted</span></div>
        `;
      } else if (p.kind === 'cleanup') {
        el.innerHTML = `
          <div class="imsel__kind" style="color:${colorByKey.cleanup}">Water cleanup</div>
          <h4>${p.site}</h4>
          <div class="imsel__sub">${p.city}, ${p.state} · ${p.date}</div>
          <div class="imsel__stats"><span><strong>${fmtNum(p.gallons)}</strong> gallons protected</span></div>
        `;
      }
      // Prefill city into signup if user clicks "Start a chapter"
      el.querySelectorAll('[data-prefill-city]').forEach(a => {
        a.addEventListener('click', () => {
          setTimeout(() => {
            const ri = document.querySelector('.signup__form[data-track="volunteer"] input[name="city"]');
            if (ri) ri.value = a.dataset.prefillCity;
            // Switch to volunteer tab since that's where city lives
            const vt = document.querySelector('.signup__tab[data-track="volunteer"]');
            if (vt) vt.click();
          }, 400);
        });
      });
    };

    // Plot points
    IM.points.forEach(p => {
      const m = L.circleMarker([p.lat, p.lng], {
        radius: radiusFor(p), color: colorByKey[p.kind], weight: 2,
        fillColor: colorByKey[p.kind], fillOpacity: 0.55,
      });
      const label = p.kind === 'partner' ? p.name : `${p.city}, ${p.state}`;
      m.bindTooltip(label, { direction: 'top', offset: [0, -6] });
      m.on('click', () => renderSelected(p));
      m.addTo(layerByKey[p.kind]);
    });
    IM.layers.forEach(l => { if (l.defaultOn) layerByKey[l.key].addTo(map); });

    // Legend toggle
    document.querySelectorAll('.imlegend').forEach(btn => {
      btn.addEventListener('click', () => {
        const k = btn.dataset.layer;
        if (active.has(k)) { active.delete(k); map.removeLayer(layerByKey[k]); btn.classList.remove('is-on'); }
        else                 { active.add(k); layerByKey[k].addTo(map); btn.classList.add('is-on'); }
        updateLive();
      });
    });

    // Live stat rail + gap counter
    const updateLive = () => {
      const visible = IM.points.filter(p => active.has(p.kind));
      const sum = (k) => visible.reduce((a, p) => a + (p[k] || 0), 0);
      const gapCount = visible.filter(p => p.kind === 'gap').length;
      const chapters = visible.filter(p => p.kind === 'chapter').length;
      $('#impactmapGapCount').textContent = gapCount;
      setHTML('#impactmapLive', `
        <div class="imlive__row"><span>Chapters</span><strong>${chapters}</strong></div>
        <div class="imlive__row"><span>Meals rescued</span><strong>${fmtNum(sum('meals'))}</strong></div>
        <div class="imlive__row"><span>Trees planted</span><strong>${fmtNum(sum('trees'))}</strong></div>
        <div class="imlive__row"><span>Gallons cleaned</span><strong>${fmtNum(sum('gallons'))}</strong></div>
      `);
    };
    updateLive();

    // Recompute size once the section scrolls into view (Leaflet needs this)
    const io2 = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) { map.invalidateSize(); io2.disconnect(); } });
    }, { threshold: 0.1 });
    io2.observe(document.getElementById('impactmap'));
  }

  // ── CHAPTERS ────────────────────────────────────────────────────────
  set('#chaptersEyebrow', C.chapters.eyebrow);
  set('#chaptersTitle', C.chapters.title);
  set('#chaptersBody', C.chapters.body);
  setHTML('#chaptersGrid', C.chapters.featured.map((ch, i) => `
    <button type="button" class="chapter reveal" data-chapter="${i}">
      <div class="chapter__city">${ch.city}</div>
      <div class="chapter__state">${ch.state}</div>
      <div class="chapter__meta">
        <span>President: ${ch.president}</span>
        ${typeof ch.members === 'number' ? `<span class="chapter__members">${ch.members} member${ch.members === 1 ? '' : 's'}</span>` : ''}
      </div>
      <span class="chapter__more">View chapter →</span>
    </button>
  `).join(''));
  $('#startChapterBtn').href = C.chapters.startChapterUrl;

  // Chapter modal
  const modal = $('#chapterModal');
  const modalBody = $('#chapterModalBody');
  const openChapter = (idx) => {
    const ch = C.chapters.featured[idx];
    if (!ch) return;
    const roster = (ch.roster || []).map(m => `
      <li class="chapter-modal__member">
        <div>
          <strong>${m.name}</strong>
          <span>${m.role || ''}</span>
        </div>
        ${m.instagram ? `<a href="${m.instagram}" target="_blank" rel="noreferrer" aria-label="${m.name} on Instagram">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" width="20" height="20"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="0.8" fill="currentColor"/></svg>
        </a>` : ''}
      </li>
    `).join('') || '<li class="chapter-modal__empty">Roster coming soon.</li>';
    modalBody.innerHTML = `
      <div class="eyebrow eyebrow--pink">Chapter</div>
      <h3 id="chapterModalTitle" class="chapter-modal__title">${ch.city}, ${ch.state}</h3>
      ${ch.blurb ? `<p class="chapter-modal__blurb">${ch.blurb}</p>` : ''}
      <div class="chapter-modal__stats">
        ${typeof ch.members === 'number' ? `<span><strong>${ch.members}</strong> member${ch.members === 1 ? '' : 's'}</span>` : ''}
        <span>President: <strong>${ch.president}</strong></span>
        ${ch.instagram ? `<a class="chapter-modal__ig" href="${ch.instagram}" target="_blank" rel="noreferrer">@chapter on Instagram ↗</a>` : ''}
      </div>
      <h4 class="chapter-modal__subhead">Roster</h4>
      <ul class="chapter-modal__roster">${roster}</ul>
    `;
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  };
  const closeChapter = () => {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  };
  document.querySelectorAll('[data-chapter]').forEach(btn => {
    btn.addEventListener('click', () => openChapter(Number(btn.dataset.chapter)));
  });
  modal.querySelectorAll('[data-close]').forEach(el => el.addEventListener('click', closeChapter));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal.classList.contains('is-open')) closeChapter(); });

  // ── PARTNERS ────────────────────────────────────────────────────────
  set('#partnersEyebrow', C.partners.eyebrow);
  set('#partnersTitle', C.partners.title);
  set('#partnersBody', C.partners.body);

  const partnerLogos = C.partners.logos.map(p => {
    const obj = (typeof p === 'string') ? { name: p } : p;
    const href = obj.website || obj.instagram || '';
    const inner = obj.logo
      ? `<img src="${obj.logo}" alt="${obj.name}" /><span>${obj.name}</span>`
      : `<span>${obj.name}</span>`;
    const igBadge = obj.instagram && obj.website
      ? `<a class="partner-logo__ig" href="${obj.instagram}" target="_blank" rel="noreferrer" aria-label="${obj.name} on Instagram" onclick="event.stopPropagation()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" width="14" height="14"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="0.8" fill="currentColor"/></svg>
        </a>`
      : '';
    return href
      ? `<a class="partner-logo is-link" href="${href}" target="_blank" rel="noreferrer">${inner}${igBadge}</a>`
      : `<span class="partner-logo">${inner}</span>`;
  }).join('');
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

  // Inline Zeffy embed — give right here, never leave the page
  if (C.brand.donateEmbedUrl) {
    setHTML('#donateEmbed', `
      <iframe
        title="Donate to BetterNature"
        src="${C.brand.donateEmbedUrl}"
        allowpaymentrequest="true"
        allowtransparency="true"
        loading="lazy"
        referrerpolicy="no-referrer-when-downgrade"
      ></iframe>
    `);
  }

  // Alternative payment methods (PayPal Giving Fund, Venmo, Cash App, check)
  const gl = C.brand.giveLinks || {};
  const altMethods = [
    { key: 'paypal',  label: 'PayPal',   sub: 'Zero-fee via Giving Fund', href: gl.paypal,
      icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M7.5 20h-3l2.2-14h5.6c2.8 0 4.8 1.2 4.2 4.1-.7 3.5-3.6 4.5-6.6 4.5H8.1l-.6 5.4zm1.9-8h1.7c1.6 0 2.8-.5 3.1-2.2.3-1.6-.7-2-2.1-2h-2l-.7 4.2zM16 14l-.6 4h-2.9l2.2-14h5c2.9 0 4.9 1.3 4.3 4.2-.7 3.5-3.5 4.5-6.5 4.5H16zm.5-3h1.7c1.6 0 2.8-.5 3.1-2.2.3-1.6-.7-2-2.1-2h-2l-.7 4.2z"/></svg>' },
    { key: 'venmo',   label: 'Venmo',    sub: '@betternature', href: gl.venmo,
      icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M19.5 4c.8 1.1 1.2 2.3 1.2 3.8 0 4.8-4.1 11-7.4 15.3H5.6L2.5 4.3l6.8-.6 1.6 13c1.5-2.5 3.4-6.3 3.4-9 0-1.5-.3-2.5-.7-3.3L19.5 4z"/></svg>' },
    { key: 'cashapp', label: 'Cash App', sub: '$betternature', href: gl.cashapp,
      icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M18.5 2h-13A3.5 3.5 0 0 0 2 5.5v13A3.5 3.5 0 0 0 5.5 22h13a3.5 3.5 0 0 0 3.5-3.5v-13A3.5 3.5 0 0 0 18.5 2zm-2.2 8.3c-.8-.7-1.9-1.1-3-1.1-.7 0-1.5.2-1.5.8 0 .6.6.8 1.7 1.2 1.8.6 3.3 1.4 3.3 3.2 0 2-1.5 3.3-4 3.5l-.2 1.3c0 .2-.2.4-.4.4h-1.5c-.3 0-.5-.3-.4-.5l.2-1.2A6 6 0 0 1 7 16.4c-.2-.2-.2-.5 0-.7l1-1c.2-.2.5-.2.7 0 .8.8 2 1.2 3.2 1.2.9 0 1.5-.3 1.5-.9 0-.6-.6-.8-1.9-1.3-1.6-.5-3-1.3-3-3.1 0-2 1.6-3.3 3.8-3.4l.2-1.3c0-.2.2-.4.4-.4h1.5c.3 0 .5.2.4.5L14.6 7c.8.2 1.5.6 2 1 .2.2.2.5 0 .7l-1 1c-.2.2-.4.2-.6 0z"/></svg>' },
    { key: 'check',   label: 'Mail a check', sub: 'Tax-deductible', href: gl.check,
      icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="6" width="20" height="13" rx="2"/><path d="M6 10h7M6 13h4M15 15h3"/></svg>' },
  ].filter(m => m.href);
  if (altMethods.length) {
    setHTML('#donateAlt', `
      <div class="donate__altHead">Other ways to give</div>
      <div class="donate__altGrid">
        ${altMethods.map(m => `
          <a class="donate__altBtn" href="${m.href}" target="_blank" rel="noreferrer">
            ${m.icon}<span><strong>${m.label}</strong><em>${m.sub}</em></span>
          </a>
        `).join('')}
      </div>
    `);
  }

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

  // ── GET THE APP ─────────────────────────────────────────────────────
  if (C.getApp) {
    set('#getappEyebrow', C.getApp.eyebrow);
    set('#getappTitle', C.getApp.title);
    set('#getappBody', C.getApp.body);
    set('#getappQrNote', C.getApp.qrNote || '');
    const links = (C.brand && C.brand.appLinks) || {};
    const webUrl = links.webApp || 'https://app.betternatureofficial.org';
    const qr = $('#getappQr');
    if (qr) qr.src = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=8&data=${encodeURIComponent(webUrl)}`;
    const ctas = [
      { href: links.appStore || '#', label: 'App Store', sub: 'Download on the', cls: 'btn--forest' },
      { href: links.googlePlay || '#', label: 'Google Play', sub: 'Get it on', cls: 'btn--forest' },
      { href: webUrl, label: 'Open web app', sub: 'app.betternatureofficial.org', cls: 'btn--pink' },
    ];
    setHTML('#getappCtas', ctas.map(c =>
      `<a class="btn ${c.cls} btn--lg storebtn" href="${c.href}" target="_blank" rel="noreferrer"><small>${c.sub}</small><span>${c.label}</span></a>`
    ).join(''));
  }

  // ── SIGNUP ──────────────────────────────────────────────────────────
  if (C.signup) {
    set('#signupEyebrow', C.signup.eyebrow);
    set('#signupTitle', C.signup.title);
    set('#signupBody', C.signup.body);
    const tracks = C.signup.tracks || [];
    setHTML('#signupTabs', tracks.map((t, i) =>
      `<button class="signup__tab ${i === 0 ? 'is-active' : ''}" data-track="${t.key}">${t.label}</button>`
    ).join(''));
    const renderField = (f) => {
      const req = f.required ? 'required' : '';
      if (f.type === 'textarea') {
        return `<label><span>${f.label}${f.required ? ' *' : ''}</span><textarea name="${f.name}" rows="3" ${req}></textarea></label>`;
      }
      if (f.type === 'select') {
        const opts = (f.options || []).map(o => `<option value="${o}">${o}</option>`).join('');
        return `<label><span>${f.label}${f.required ? ' *' : ''}</span><select name="${f.name}" ${req}><option value="">Choose one…</option>${opts}</select></label>`;
      }
      const extra = f.minLength ? `minlength="${f.minLength}"` : '';
      const autocomplete = f.type === 'password' ? 'autocomplete="new-password"' : '';
      return `<label><span>${f.label}${f.required ? ' *' : ''}</span><input type="${f.type}" name="${f.name}" ${req} ${extra} ${autocomplete} /></label>`;
    };
    setHTML('#signupForms', tracks.map((t, i) => `
      <form class="signup__form ${i === 0 ? 'is-active' : ''}" data-track="${t.key}" data-mailto="${t.mailto || C.brand.email}">
        <p class="signup__tagline">${t.tagline || ''}</p>
        <div class="signup__fields">${(t.fields || []).map(renderField).join('')}</div>
        <button type="submit" class="btn btn--pink btn--lg">${t.submit || 'Submit'}</button>
        <p class="signup__status" aria-live="polite"></p>
      </form>
    `).join(''));

    document.querySelectorAll('.signup__tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const key = tab.dataset.track;
        document.querySelectorAll('.signup__tab').forEach(t => t.classList.toggle('is-active', t.dataset.track === key));
        document.querySelectorAll('.signup__form').forEach(f => f.classList.toggle('is-active', f.dataset.track === key));
      });
    });

    // Forms POST directly to FormSubmit — no mailto, no page reload.
    // Override endpoint via content.signup.submitEndpoint if needed.
    const endpoint = C.signup.submitEndpoint
      || `https://formsubmit.co/ajax/${C.brand.email}`;
    document.querySelectorAll('.signup__form').forEach(form => {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const status = form.querySelector('.signup__status');
        const btn = form.querySelector('button[type="submit"]');
        const track = form.dataset.track;
        const data = Object.fromEntries(new FormData(form).entries());
        const trackLabel =
          track === 'chapter' ? 'New chapter application' :
          track === 'volunteer' ? 'Volunteer' :
          'Business partner';
        const subject = `[${trackLabel}] ${data.businessName || data.fullName || 'New signup'}${data.city ? ` — ${data.city}` : ''}`;
        // Carry the referral code (if any) into both the FormSubmit email
        // AND the auto-created Firebase account.
        const referralCode = (() => {
          try { return localStorage.getItem('bn_ref') || ''; } catch { return ''; }
        })();
        const payload = {
          _subject: subject,
          _template: 'table',
          _captcha: 'false',
          track,
          referral_code: referralCode,
          ...data,
        };
        btn.disabled = true;
        const originalLabel = btn.textContent;
        btn.textContent = 'Sending…';
        if (status) { status.textContent = ''; status.className = 'signup__status'; }
        try {
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify(payload),
          });
          if (!res.ok) throw new Error('Submit failed: ' + res.status);

          // If the visitor provided an email + password, create their BetterNature
          // account right here so it works on the app + web app + website.
          let accountMsg = '';
          if (window.BN_SIGNUP && data.email && data.password) {
            try {
              await window.BN_SIGNUP({
                email: data.email,
                password: data.password,
                name: data.fullName || data.businessName || '',
                role: track === 'partner' ? 'partner' : 'volunteer',
                phone: data.phone || '',
                city: data.city || '',
                zip: data.zip || '',
                referralCode,
              });
              accountMsg = ' Your account is active — open the BetterNature app with the same email and password to finish setup.';
            } catch (authErr) {
              accountMsg = ` (Could not auto-create account: ${authErr.message}. Sign up in the app with the same email.)`;
            }
          } else if (track === 'chapter') {
            accountMsg = '';
          } else {
            accountMsg = ' To finish joining the network, download the BetterNature app and sign up with the same email.';
          }

          form.reset();
          btn.textContent = '✓ Sent';
          if (status) {
            const appLinks = C.brand?.appLinks || {};
            const appCtas = [
              appLinks.appStore && appLinks.appStore !== '#' ? `<a href="${appLinks.appStore}" target="_blank" rel="noreferrer">App Store</a>` : '',
              appLinks.googlePlay && appLinks.googlePlay !== '#' ? `<a href="${appLinks.googlePlay}" target="_blank" rel="noreferrer">Google Play</a>` : '',
              appLinks.webApp ? `<a href="${appLinks.webApp}" target="_blank" rel="noreferrer">Web app</a>` : '',
            ].filter(Boolean).join(' · ');
            status.className = 'signup__status is-ok';
            status.innerHTML = (track === 'volunteer'
              ? "You're in. We'll reach out within 24 hours with your chapter match."
              : track === 'chapter'
              ? "Application received. We'll send the chapter playbook and onboarding call invite within 48 hours."
              : "Got it. A partner coordinator will reach out within 24 hours to schedule your 15-min call.")
              + accountMsg
              + (appCtas ? `<br><small style="display:block;margin-top:8px;">Get the app: ${appCtas}</small>` : '');
          }
        } catch (err) {
          btn.disabled = false;
          btn.textContent = originalLabel;
          if (status) {
            status.className = 'signup__status is-err';
            status.innerHTML = `Something went wrong sending that. Please email <a href="mailto:${C.brand.email}">${C.brand.email}</a> directly.`;
          }
        }
      });
    });
  }

  // ── FOOTER ──────────────────────────────────────────────────────────
  set('#footerTagline', C.brand.tagline);
  const fe = $('#footerEmail');
  fe.textContent = C.brand.email;
  fe.href = 'mailto:' + C.brand.email;
  $('#year').textContent = new Date().getFullYear();
  // Surface the 501(c)(3) + EIN in the footer so donors and partners can
  // verify tax-exempt status without asking.
  if (C.brand.ein) {
    const fl = document.getElementById('footerLegal');
    if (fl) fl.textContent = `BetterNature Inc. is a 501(c)(3) nonprofit · EIN ${C.brand.ein}`;
  }

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
