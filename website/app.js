// ═══════════════════════════════════════════════════════════════════════════
//  BETTER NATURE — page renderer
//  Reads window.CONTENT (from content.js) and paints everything dynamically.
//  You only edit content.js to change any text, number, team member, event,
//  testimonial, partner, press article, etc.
// ═══════════════════════════════════════════════════════════════════════════

(async function () {
  if (!window.CONTENT) { console.error('CONTENT not loaded'); return; }

  // Burn the old admin.html localStorage cache. That editor wrote
  // to 'betternature.content.overrides' and got deep-merged on top
  // of content.js — over time visitors accumulated stale entries
  // (empty arrays from blank tabs, etc.) that wiped sections of
  // the homepage. The CMS moved to the app's Website Content
  // screen + Firestore weeks ago; we want every visitor reading
  // from a clean slate now.
  try { localStorage.removeItem('betternature.content.overrides'); } catch {}

  // Pull the live site_content/main doc from Firestore (edited by execs
  // inside the app's Website Content screen) and merge it over the
  // static content.js defaults. Best-effort — if Firestore is down we
  // fall back to whatever shipped in content.js so the page still paints.
  try {
    const { applyLiveContent } = await import('./firebase-site-content.js?v=2026-06-05c');
    await applyLiveContent();
  } catch (e) {
    console.warn('live site_content unavailable, using static content.js', e);
  }
  let C = window.CONTENT;

  // Referral capture — first visitor with ?ref=CODE has it stashed so it
  // survives the click into signup (or the click into the web app build,
  // where authFirebase reads it back via readPendingReferralCode()).
  try {
    const refCode = new URL(window.location.href).searchParams.get('ref');
    if (refCode) localStorage.setItem('bn_ref', refCode.trim().toUpperCase());
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
      document.querySelectorAll(`#nav a[href="#${key}"]`).forEach(a => a.style.display = 'none');
    });
  }

  const setHTML = (sel, val) => { const el = $(sel); if (el) el.innerHTML = val; };

  // Accounts are created in the BetterNature app, not on this site. Every
  // "join" link points at the right app screen and carries a referral code
  // if the visitor arrived with ?ref= (the app reads it from the URL).
  const APP_BASE = ((C.brand && C.brand.appLinks && C.brand.appLinks.webApp) || 'https://app.betternatureofficial.org').replace(/\/$/, '');
  const appUrl = (route) => {
    let ref = '';
    try { ref = localStorage.getItem('bn_ref') || ''; } catch (e) {}
    return `${APP_BASE}/${ref ? `?ref=${encodeURIComponent(ref)}` : ''}#/${route}`;
  };
  const APP_ROUTES = { volunteer: 'signup', business: 'signup/restaurant', chapter: 'start-chapter', login: 'login' };
  const setHref = (sel, val) => { const el = $(sel); if (el) el.href = val; };

  setHref('.nav__join', appUrl('signup'));
  setHref('.nav__signin', appUrl(APP_ROUTES.login));
  document.querySelectorAll('.nav__partner').forEach(link => link.href = appUrl(APP_ROUTES.business));
  setHref('.nav__ctas > .btn--pink', C.brand.donateUrl || C.donate.cta.href);

  // ── HERO ────────────────────────────────────────────────────────────
  // Keep the opening intentionally short; program detail lives below it.
  set('#heroEyebrow', C.hero.introEyebrow || 'A youth-led nonprofit');
  const previousTagline = C.hero.headline?.trim() === 'Feed people. Plant forests.' && C.hero.headlineItalic?.trim() === 'Protect the water.';
  set('#heroHeadline', previousTagline ? 'Care for people.' : C.hero.headline);
  set('#heroHeadlineItalic', previousTagline ? 'Care for our planet.' : C.hero.headlineItalic);
  set('#heroSub', C.hero.introLine || 'Help rescue food, restore native forests, and protect waterways.');
  // Decorate text nodes rather than interpreting CMS copy as HTML.
  const accentWords = (selector, pattern, classFor) => {
    const node = $(selector);
    if (!node) return;
    const copy = node.textContent;
    const parts = document.createDocumentFragment();
    let end = 0;
    for (const match of copy.matchAll(pattern)) {
      parts.append(document.createTextNode(copy.slice(end, match.index)));
      const word = document.createElement('span');
      word.className = classFor(match[0].toLowerCase());
      word.textContent = match[0]; parts.append(word);
      end = match.index + match[0].length;
    }
    parts.append(document.createTextNode(copy.slice(end)));
    node.replaceChildren(parts);
  };
  accentWords('#heroHeadline', /\bpeople\b/gi, () => 'hero__highlight hero__highlight--people');
  accentWords('#heroHeadlineItalic', /\bplanet\b/gi, () => 'hero__highlight hero__highlight--planet');
  accentWords('#heroSub', /\bnative forests\b|\bwaterways\b|\bfood\b/gi, word => 'hero__cause hero__cause--' + ({food:'food','native forests':'forest',waterways:'water'}[word]));

  const heroCta1 = $('#heroCta1');
  heroCta1.innerHTML = 'Find your chapter <span aria-hidden="true">↗</span>';
  heroCta1.href = '#chapters';

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

  // Wordmark under each program logo.
  const marks = {
    iris: { name: 'IRIS', sub: 'food rescue' },
    evergreen: { name: 'Evergreen', sub: 'conservation' },
    hydro: { name: 'Hydro', sub: 'waterways' },
  };
  const icons = {
    iris: '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="32" cy="28" r="12"/><path d="M20 28 C 20 20, 44 20, 44 28"/><path d="M16 42 L 48 42 L 44 56 L 20 56 Z"/></svg>',
    evergreen: '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M32 8 L 20 24 L 26 24 L 16 40 L 24 40 L 14 56 L 50 56 L 40 40 L 48 40 L 38 24 L 44 24 Z"/><path d="M32 56 L 32 62"/></svg>',
    hydro: '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M32 6 C 20 24, 16 34, 16 42 a 16 16 0 0 0 32 0 C 48 34, 44 24, 32 6 Z"/><path d="M24 42 a 8 8 0 0 0 8 8"/></svg>',
  };

  // Defensive: editor saves may leave per-item fields missing. Fall
  // back to safe values so one bad item never aborts the whole
  // section render (and therefore every section beneath it).
  setHTML('#programsList', (C.programs.items || []).map((p, i) => {
    const key  = p?.key  || `program-${i}`;
    const code = p?.code || '';
    const title = p?.title || '';
    const body = p?.body || p?.blurb || '';
    // Numbers live once, in the Impact section; program cards keep only
    // status words like "Launching" or "Memphis" so nothing repeats.
    const stats = (Array.isArray(p?.stats) ? p.stats : []).filter((s) => s && !/\d/.test(String(s.value ?? '')));
    const cta  = p?.cta && p.cta.href
      ? `<a href="${appUrl('')}" class="btn btn--forest">${p.cta.text || 'Learn more'}</a>`
      : '';
    return `
    <div id="program-${key}" class="program reveal ${i % 2 === 1 ? 'program--reverse' : ''}" data-program="${key}">
      <div class="program__inner">
        <div class="program__code">${code}</div>
        <h3 class="program__title">${title}</h3>
        <p class="program__body">${body}</p>
        ${stats.length ? `<div class="program__stats">
          ${stats.map(s => `
            <div>
              <div class="program__stat-value">${s?.value ?? ''}</div>
              <div class="program__stat-label">${s?.label ?? ''}</div>
            </div>
          `).join('')}
        </div>` : ''}
        ${cta}
      </div>
      <div class="program__visual program__visual--${key}">
        <!-- Real project logo. Falls back gracefully to the SVG icon
             beneath it if the PNG isn't deployed yet. -->
        <img
          src="identity/${key}.svg"
          alt="${title}"
          class="program__logo"
          onerror="this.style.display='none'; this.nextElementSibling && (this.nextElementSibling.style.display='block');"
        />
        <div class="program__logoFallback" style="display:none">${icons[key] || ''}</div>
        ${marks[key] ? `<div class="program__mark" aria-hidden="true"><span class="program__markName">${marks[key].name}</span><span class="program__markSub">${marks[key].sub}</span></div>` : ''}
      </div>
    </div>
  `; }).join(''));

  // ── HOW IT WORKS ────────────────────────────────────────────────────
  set('#howEyebrow', C.howItWorks.eyebrow);
  set('#howTitle', C.howItWorks.title);

  const howTabs = $('#howTabs');
  const howContent = $('#howContent');
  const renderTrack = (idx) => {
    const t = C.howItWorks.tracks[idx];
    howContent.setAttribute('role', 'tabpanel'); howContent.setAttribute('aria-labelledby', `how-tab-${idx}`);
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
      <a href="${appUrl(APP_ROUTES[t.signupTrack || ['business', 'volunteer'][idx]] || 'signup')}" class="btn btn--pink btn--lg">${t.cta.text} <span aria-hidden="true">↗</span></a>
    `;
    howTabs.querySelectorAll('.how__tab').forEach((tab, i) => {
      tab.classList.toggle('is-active', i === idx);
      tab.setAttribute('aria-selected', String(i === idx)); tab.tabIndex = i === idx ? 0 : -1;
    });
  };
  howTabs.setAttribute('role', 'tablist'); howTabs.setAttribute('aria-label', 'How to get involved');
  howTabs.innerHTML = C.howItWorks.tracks.map((t, i) =>
    `<button type="button" role="tab" id="how-tab-${i}" aria-controls="howContent" class="how__tab ${i === 0 ? 'is-active' : ''}" data-idx="${i}">${t.label}</button>`
  ).join('');
  howTabs.querySelectorAll('.how__tab').forEach((tab, i) => {
    tab.addEventListener('click', () => renderTrack(i));
    tab.addEventListener('keydown', event => {
      const tabs = [...howTabs.querySelectorAll('.how__tab')];
      const next = event.key === 'ArrowRight' ? (i + 1) % tabs.length : event.key === 'ArrowLeft' ? (i - 1 + tabs.length) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null;
      if (next === null) return;
      event.preventDefault(); renderTrack(next); tabs[next].focus();
    });
  });
  renderTrack(0);


  // ── CHAPTERS ────────────────────────────────────────────────────────
  set('#chaptersEyebrow', C.chapters.eyebrow);
  set('#chaptersTitle', C.chapters.title);
  set('#chaptersBody', C.chapters.body);
  const startChapterHref = appUrl(APP_ROUTES.chapter);
  setHref('#chapterCreate', startChapterHref);

  // Live chapters from Firestore. We distinguish three states so
  // the user knows what's going on:
  //   - fetch succeeded with N>0 chapters → render the live list
  //   - fetch succeeded with 0 chapters   → empty state ("none yet")
  //                                          NOT the static featured list,
  //                                          which would mask the
  //                                          "I added one but it's not
  //                                          showing" bug we keep hitting.
  //   - fetch threw (offline, rules)      → static featured list as
  //                                          a graceful fallback.
  let liveChapters = null;
  try {
    // Cache-bust the dynamic import — Cloudflare Pages will sometimes
    // serve an older cached firebase-chapters.js even after a fresh
    // deploy. ?v= forces the browser to fetch the live build.
    const { listChapters } = await import('./firebase-chapters.js?v=2026-06-05a');
    liveChapters = await listChapters();
    console.log(`[bn] live chapters loaded: ${liveChapters.length}`);
  } catch (e) {
    console.warn('Live chapters fetch failed; using static featured list', e);
  }
  const renderChapters = Array.isArray(liveChapters)
    ? liveChapters
    : C.chapters.featured;
  const liveLoaded = Array.isArray(liveChapters);
  window.BN_CHAPTER_DIRECTORY = {
    source: liveLoaded ? 'live' : 'published',
    chapters: renderChapters.map(ch => ({
      region: regionOf(ch.country || '') || 'Unspecified',
      members: Number.isFinite(ch.member_count) ? ch.member_count : Number.isFinite(ch.members) ? ch.members : null,
    })),
  };
  window.dispatchEvent(new CustomEvent('bn:chapters', { detail: window.BN_CHAPTER_DIRECTORY }));

  if (renderChapters.length === 0) {
    setHTML('#chaptersGrid', `
      <div class="chapter chapter--empty">
        <div class="chapter__city">No chapters yet</div>
        <div class="chapter__meta">
          <span>Be the first to start one.</span>
        </div>
      </div>
    `);
  } else {
    setHTML('#chaptersGrid', renderChapters.map((ch, i) => {
      const city = ch.city || ch.name || '';
      const state = ch.state || '';
      const country = countryName(ch.country || '');
      const president = ch.president_name || ch.president || '';
      const memberCount = (typeof ch.member_count === 'number' ? ch.member_count : (typeof ch.members === 'number' ? ch.members : null));
      const region = regionOf(ch.country || '');
      const search = [city, state, country, region, ch.name].filter(Boolean).join(' ').toLowerCase();
      return `
      <button type="button" class="chapter" data-chapter="${i}" data-country="${country}" data-region="${region}" data-city="${city.replace(/"/g, '')}" data-members="${memberCount || 0}" data-search="${search.replace(/"/g, '')}">
        <div class="chapter__region">${region}</div>
        <div class="chapter__city">${city}</div>
        <div class="chapter__state">${[state, country].filter(Boolean).join(' · ')}</div>
        <div class="chapter__meta">
          ${president ? `<span>Led by ${president}</span>` : '<span>New chapter</span>'}
          ${memberCount ? `<span class="chapter__members">${memberCount} member${memberCount === 1 ? '' : 's'}</span>` : ''}
        </div>
        <span class="chapter__more">View chapter →</span>
      </button>
    `;
    }).join(''));
    setupChapterBrowser();
  }

  // Chapters store ISO country codes ("CHL"); show names instead.
  // Region for sorting/filtering chapters (by ISO country code).
  function regionOf(code) {
    const c = (code || '').toUpperCase();
    const REGIONS = {
      'North America': ['USA', 'US', 'CAN', 'CA'],
      'Latin America': ['MEX', 'MX', 'GTM', 'GT', 'CHL', 'CL', 'ECU', 'EC', 'URY', 'UY', 'ARG', 'AR', 'BRA', 'BR', 'COL', 'CO', 'PER', 'PE', 'PRY', 'PY', 'BOL', 'BO', 'CRI', 'CR', 'PAN', 'PA', 'DOM', 'DO', 'HND', 'HN', 'SLV', 'SV', 'NIC', 'NI', 'VEN', 'VE'],
      'Asia': ['IND', 'IN', 'PAK', 'PK', 'BGD', 'BD', 'NPL', 'NP', 'PHL', 'PH', 'IDN', 'ID', 'CHN', 'CN', 'JPN', 'JP', 'KOR', 'KR', 'SGP', 'SG', 'MYS', 'MY', 'THA', 'TH', 'VNM', 'VN', 'LKA', 'LK', 'ARE', 'AE'],
      'Europe': ['GBR', 'GB', 'DEU', 'DE', 'FRA', 'FR', 'ESP', 'ES', 'ITA', 'IT', 'NLD', 'NL', 'PRT', 'PT', 'IRL', 'IE'],
      'Africa': ['NGA', 'NG', 'KEN', 'KE', 'GHA', 'GH', 'ZAF', 'ZA', 'EGY', 'EG', 'ETH', 'ET', 'UGA', 'UG'],
      'Oceania': ['AUS', 'AU', 'NZL', 'NZ'],
    };
    for (const [name, codes] of Object.entries(REGIONS)) if (codes.includes(c)) return name;
    return c ? 'Other' : '';
  }

  function countryName(code) {
    if (!code) return '';
    const COUNTRY_ISO2 = { USA: 'US', CHL: 'CL', ECU: 'EC', GTM: 'GT', IND: 'IN', URY: 'UY', MEX: 'MX', CAN: 'CA', GBR: 'GB', ARG: 'AR', BRA: 'BR', COL: 'CO', PER: 'PE', PRY: 'PY', BOL: 'BO', CRI: 'CR', PAN: 'PA', DOM: 'DO', NGA: 'NG', KEN: 'KE', GHA: 'GH', PHL: 'PH', PAK: 'PK', BGD: 'BD', NPL: 'NP', AUS: 'AU', NZL: 'NZ', DEU: 'DE', FRA: 'FR', ESP: 'ES', ITA: 'IT' };
    const iso2 = code.length === 2 ? code.toUpperCase() : COUNTRY_ISO2[code.toUpperCase()];
    try {
      if (iso2 && typeof Intl !== 'undefined' && Intl.DisplayNames) {
        const name = new Intl.DisplayNames(['en'], { type: 'region' }).of(iso2);
        return iso2 === 'US' ? 'United States' : name;
      }
    } catch (e) { /* fall through */ }
    return code;
  }

  // Search, country filters and a swipeable rail, so nobody has to scroll
  // past every chapter card to reach the rest of the page.
  function setupChapterBrowser() {
    const rail = $('#chaptersGrid');
    const input = $('#chapterSearch');
    const filters = $('#chapterFilters');
    const count = $('#chapterCount');
    const prev = $('#chaptersPrev');
    const next = $('#chaptersNext');
    if (!rail) return;
    const cards = Array.from(rail.querySelectorAll('.chapter[data-chapter]'));
    const start = rail.querySelector('.chapter--start');
    const ORDER = ['North America', 'Latin America', 'Europe', 'Africa', 'Asia', 'Oceania', 'Other'];
    const regions = ORDER.filter((r) => cards.some((c) => c.dataset.region === r));
    let region = '';
    let sort = 'region';
    const sortSel = $('#chapterSort');

    if (filters) {
      filters.innerHTML = regions.length > 1
        ? ['', ...regions].map((r) => {
            const n = r ? cards.filter((c) => c.dataset.region === r).length : cards.length;
            return `<button type="button" class="chapters__chip${r ? '' : ' is-active'}" aria-pressed="${!r}" data-region="${r}">${r || 'All'} <span>${n}</span></button>`;
          }).join('')
        : '';
      filters.querySelectorAll('.chapters__chip').forEach((chip) => chip.addEventListener('click', () => {
        region = chip.dataset.region;
        filters.querySelectorAll('.chapters__chip').forEach((c) => { c.classList.toggle('is-active', c === chip); c.setAttribute('aria-pressed', String(c === chip)); });
        apply();
      }));
    }
    window.addEventListener('bn:region', event => {
      const chip = Array.from(filters?.querySelectorAll('.chapters__chip') || []).find(c => c.dataset.region === event.detail);
      if (chip) chip.click();
    });
    if (sortSel) sortSel.addEventListener('change', () => { sort = sortSel.value; apply(); });

    // Reorder the rail without touching the DOM (keeps modal indices valid).
    function applySort() {
      const ranked = cards.slice().sort((a, b) => {
        if (sort === 'members') return (+b.dataset.members - +a.dataset.members) || a.dataset.city.localeCompare(b.dataset.city);
        if (sort === 'region') {
          const r = ORDER.indexOf(a.dataset.region) - ORDER.indexOf(b.dataset.region);
          if (r) return r;
        }
        return a.dataset.city.localeCompare(b.dataset.city);
      });
      ranked.forEach((c, i) => { c.style.order = i; });
      if (start) start.style.order = ranked.length + 1;
      rail.classList.toggle('is-by-region', sort === 'region');
    }

    function apply() {
      const q = (input && input.value || '').trim().toLowerCase();
      let shown = 0;
      cards.forEach((c) => {
        const ok = (!q || c.dataset.search.includes(q)) && (!region || c.dataset.region === region);
        c.hidden = !ok;
        if (ok) shown++;
      });
      if (start) {
        start.querySelector('.chapter__city').textContent = shown ? 'Not on the list?' : (q ? `No chapter in “${input.value.trim()}” yet` : 'No chapters here yet');
      }
      if (count) count.textContent = `${shown} of ${cards.length} chapter${cards.length === 1 ? '' : 's'}`;
      applySort();
      rail.scrollTo({ left: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
      updateArrows();
    }
    function updateArrows() {
      const max = rail.scrollWidth - rail.clientWidth - 2;
      if (prev) prev.disabled = rail.scrollLeft <= 2;
      if (next) next.disabled = rail.scrollLeft >= max;
    }
    const page = (dir) => rail.scrollBy({ left: dir * rail.clientWidth * 0.85, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    if (prev) prev.addEventListener('click', () => page(-1));
    if (next) next.addEventListener('click', () => page(1));
    rail.addEventListener('scroll', updateArrows, { passive: true });
    window.addEventListener('resize', updateArrows);
    if (input) input.addEventListener('input', apply);
    apply();
  }

  // Public chapter people only; no private user collection is read.
  const { renderChapterPeople, escapeText, safeLink } = await import('./chapter-people.js?v=navigation-people-2');
  const modal = $('#chapterModal');
  const modalBody = $('#chapterModalBody');
  let previousOverflow = '';
  const openChapter = idx => {
    const ch = renderChapters[idx];
    if (!ch) return;
    const count = typeof ch.member_count === 'number' ? ch.member_count : typeof ch.members === 'number' ? ch.members : null;
    const fallback = (C.chapters.featured || []).find(item => String(item.city).toLowerCase() === String(ch.city).toLowerCase())?.roster || [];
    const instagram = safeLink(ch.instagram);
    modalBody.innerHTML = `
      <header class="chapter-dialog__header">
        <div class="eyebrow eyebrow--pink">Meet the chapter</div>
        <h2 id="chapterModalTitle" class="chapter-modal__title">${escapeText(ch.city || ch.name)}${ch.state ? ', ' + escapeText(ch.state) : ''}</h2>
        ${ch.description || ch.blurb ? `<p class="chapter-modal__blurb">${escapeText(ch.description || ch.blurb)}</p>` : ''}
        <div class="chapter-modal__stats">${count != null ? `<span><strong>${count}</strong> member${count === 1 ? '' : 's'}</span>` : ''}${instagram ? `<a href="${escapeText(instagram)}" target="_blank" rel="noopener noreferrer">Chapter on Instagram ↗</a>` : ''}</div>
      </header>
      ${renderChapterPeople(ch, fallback)}`;
    modalBody.querySelectorAll('.chapter-person img').forEach(img => img.addEventListener('error', () => img.remove(), {once:true}));
    const search = modalBody.querySelector('[data-people-search]');
    search?.addEventListener('input', () => {
      const query = search.value.trim().toLowerCase(); let visible = 0;
      modalBody.querySelectorAll('.chapter-person').forEach(card => { card.hidden = !card.dataset.search.includes(query); if (!card.hidden) visible++; });
      modalBody.querySelectorAll('.chapter-people__group').forEach(group => group.hidden = ![...group.querySelectorAll('.chapter-person')].some(card => !card.hidden));
      modalBody.querySelector('[data-people-status]').textContent = query ? `${visible} matching ${visible === 1 ? 'person' : 'people'}` : '';
    });
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    modal.showModal();
  };
  modal.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => modal.close()));
  modal.addEventListener('click', event => { if (event.target === modal) modal.close(); });
  modal.addEventListener('close', () => { document.body.style.overflow = previousOverflow; });
  modal.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); modal.close(); } });
  document.querySelectorAll('[data-chapter]').forEach(button => button.addEventListener('click', () => openChapter(Number(button.dataset.chapter))));

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
  const memberText = value => String(value || '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  setHTML('#teamGrid', C.team.members.map(m => {
    const initials = String(m.name || '').trim().split(/\s+/).filter(Boolean).map(word => word[0]).filter((_, i, all) => i === 0 || i === all.length - 1).join('');
    let profile = m.linkedin || (m.name?.trim().toLowerCase() === 'satvik koya' ? 'https://www.linkedin.com/in/satvik-koya-162041286/' : '');
    try { const url = new URL(profile); if (url.protocol !== 'https:' || !['linkedin.com','www.linkedin.com'].includes(url.hostname) || !url.pathname.startsWith('/in/')) profile = ''; } catch { profile = ''; }
    const portrait = m.photo || (m.name?.trim().toLowerCase() === 'satvik koya' ? 'images/team/satvik-koya.jpg' : '');
    return `<article class="member reveal">
      <div class="member__photo" ${portrait ? 'data-has-photo="true"' : ''}>
        <span class="member__initials" aria-hidden="true">${memberText(initials)}</span>
        ${portrait ? `<img src="${memberText(portrait)}" alt="${memberText(m.name)}" width="160" height="200" loading="lazy" decoding="async">` : ''}
      </div>
      <div class="member__info">
        <h3 class="member__name">${memberText(m.name)}</h3>
        <p class="member__role">${memberText(m.role)}</p>
        ${m.city ? `<p class="member__city"><svg aria-hidden="true" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M19 10c0 5-7 10-7 10S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>${memberText(m.city)}</p>` : ''}
        ${profile ? `<a class="member__profile" href="${memberText(profile)}" target="_blank" rel="noopener noreferrer" aria-label="See profile for ${memberText(m.name)} on LinkedIn (opens in a new tab)"><svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M5 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM3.5 9h3v12h-3V9Zm5.5 0h3v1.6c.5-.9 1.6-1.9 3.6-1.9 3.3 0 4.4 2.1 4.4 5.3v7h-3v-6.4c0-1.7-.3-3.1-2.2-3.1-2 0-2.8 1.5-2.8 3.1V21H9V9Z"/></svg>See profile <span aria-hidden="true">↗</span></a>` : ''}
      </div>
    </article>`;
  }).join(''));
  document.querySelectorAll('#teamGrid .member__photo img').forEach(img => img.addEventListener('error', () => img.remove(), {once:true}));

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
    <button type="button" class="tier reveal" data-amount="${t.amount}" aria-pressed="false">
      <div class="tier__amount">${t.amount}</div>
      <div class="tier__impact">${t.impact}</div>
    </button>
  `).join(''));
  const donateCta = $('#donateCta');
  donateCta.textContent = C.donate.cta.text;
  donateCta.href = C.donate.cta.href;

  // Compact, opt-in checkout. The provider owns the payment fields.
  if (C.brand.donateEmbedUrl) {
    const fullUrl = C.brand.donateUrl || C.donate.cta.href;
    setHTML('#donateEmbed', `
      <div class="donation-panel">
        <div><h3>Your support, put to work.</h3><p id="zeffyPick" aria-live="polite">Choose a suggested amount, or give what works for you.</p></div>
        <button type="button" class="btn donation-open" id="openDonation" aria-haspopup="dialog" aria-controls="zeffyFrame">Open secure donation form <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 12h14m-6-6 6 6-6 6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        <dialog class="donation-dialog" id="zeffyFrame" aria-labelledby="donationDialogTitle">
          <div class="donation-dialog__header"><div><h2 id="donationDialogTitle">Give to Better Nature</h2><p>Secure checkout by Zeffy</p></div><button type="button" class="donation-dialog__close" aria-label="Close donation form" autofocus>×</button></div>
          <div class="zeffy__stage"><p class="checkout-loading" role="status">Loading secure checkout…</p></div>
          <p class="donation-dialog__fallback">Form not loading? <a href="${fullUrl}" target="_blank" rel="noreferrer">Open full-screen checkout ↗</a></p>
        </dialog>
        <p class="donation-note">Checkout and email receipt provided by Zeffy. <a href="${fullUrl}" target="_blank" rel="noreferrer">Open full-screen checkout ↗</a></p>
      </div>`);
    const frame = $('#zeffyFrame'), stage = frame.querySelector('.zeffy__stage');
    let loaded = false;
    const load = () => {
      if (loaded) return;
      loaded = true;
      const ifr = document.createElement('iframe');
      ifr.title = 'Donate to BetterNature securely with Zeffy';
      ifr.src = C.brand.donateEmbedUrl;
      ifr.setAttribute('allow', 'payment');
      ifr.referrerPolicy = 'strict-origin-when-cross-origin';
      ifr.addEventListener('load', () => { stage.querySelector('.checkout-loading')?.remove(); });
      stage.appendChild(ifr);
    };
    // Keep the modal outside animated section ancestors; native dialog supplies
    // focus containment, Escape dismissal, and an inert background.
    document.body.appendChild(frame);
    const opener = $('#openDonation');
    let previousOverflow = '';
    opener.addEventListener('click', () => {
      if (frame.open) return;
      previousOverflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = 'hidden';
      frame.showModal(); load();
    });
    const restorePage = () => {
      document.documentElement.style.overflow = previousOverflow;
      opener.focus({preventScroll:true});
    };
    const closeDonation = () => { frame.close(); restorePage(); };
    frame.querySelector('.donation-dialog__close').addEventListener('click', closeDonation);
    frame.addEventListener('cancel', event => { event.preventDefault(); closeDonation(); });
    frame.addEventListener('click', event => {
      const rect = frame.getBoundingClientRect();
      if (event.target === frame && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) closeDonation();
    });
    frame.addEventListener('close', () => {
      // A queued close event can arrive after a rapid reopen.
      if (!frame.open) restorePage();
    });
    document.querySelectorAll('#donateTiers .tier').forEach(tier => tier.addEventListener('click', () => {
      document.querySelectorAll('#donateTiers .tier').forEach(t => { t.classList.toggle('is-picked', t === tier); t.setAttribute('aria-pressed', String(t === tier)); });
      $('#zeffyPick').textContent = `Suggested gift: ${tier.dataset.amount}. You can enter this amount or choose another at checkout.`;
      $('#donateEmbed').scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    }));
    donateCta.hidden = true;
  }

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

  // ── FIELD NOTES ────────────────────────────────────────────────────
  set('#newsTitle', 'Stories from the field.');
  set('#newsBody', 'Updates, practical guides and perspectives from across Better Nature.');
  set('#newsCta', 'Explore the journal ↗');
  $('#newsCta').href = 'blog.html';

  // ── GET THE APP ─────────────────────────────────────────────────────
  if (C.getApp) {
    set('#getappEyebrow', C.getApp.eyebrow);
    set('#getappTitle', C.getApp.title);
    set('#getappBody', C.getApp.body);
    set('#getappQrNote', C.getApp.qrNote || 'Scan to open the web app');
    const links = (C.brand && C.brand.appLinks) || {};
    const webUrl = links.webApp || 'https://app.betternatureofficial.org';
    const qr = $('#getappQr');
    if (qr) qr.src = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=8&data=${encodeURIComponent(webUrl)}`;
    const ctas = [
      { href: webUrl, label: 'Open web app', sub: 'Use in your browser', cls: 'btn--pink' },
      { href: links.appStore, label: 'App Store', sub: 'Download on the', cls: 'btn--forest' },
      { href: links.googlePlay, label: 'Google Play', sub: 'Get it on', cls: 'btn--forest' },
    ].filter(({ href }) => href && href !== '#');
    setHTML('#getappCtas', ctas.map(c =>
      `<a class="btn ${c.cls} btn--lg storebtn" href="${c.href}" target="_blank" rel="noreferrer"><small>${c.sub}</small><span>${c.label}</span></a>`
    ).join(''));
  }

  // ── JOIN (accounts live in the BetterNature app) ───────────────────
  // One place to join, one sign-up flow: each card opens the matching
  // screen in the app. The separate "Get the app" section is folded in.
  if (C.signup) {
    set('#signupEyebrow', 'Join the network');
    set('#signupTitle', 'Create your account in the BetterNature app.');
    set('#signupBody', 'One account works everywhere: on the web, on your phone, and for every chapter. Pick how you want to help.');
    const icon = {
      volunteer: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.6-7 10-7 10z"/></svg>',
      business: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10h16l-1.5-5h-13z"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/></svg>',
      chapter: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/></svg>',
    };
    const roles = [
      { key: 'volunteer', title: 'Volunteer', body: 'Claim pickups, plantings and cleanups that fit your week.', cta: 'Join as a volunteer' },
      { key: 'business', title: 'Restaurant or business', body: 'Free same-day pickup for your surplus food. Tax-deductible.', cta: 'Sign up your business' },
      { key: 'chapter', title: 'Start a chapter', body: 'Bring BetterNature to your city. Playbook within 48 hours.', cta: 'Start a chapter' },
    ];
    const links = (C.brand && C.brand.appLinks) || {};
    const stores = [
      links.appStore && links.appStore !== '#' ? `<a href="${links.appStore}" target="_blank" rel="noreferrer">App Store</a>` : '',
      links.googlePlay && links.googlePlay !== '#' ? `<a href="${links.googlePlay}" target="_blank" rel="noreferrer">Google Play</a>` : '',
    ].filter(Boolean).join(' · ');
    setHTML('#signupTabs', '');
    setHTML('#signupForms', `
      <div class="join__grid">
        ${roles.map((r) => `
          <a class="join__card" data-track="${r.key}" href="${appUrl(APP_ROUTES[r.key])}">
            <span class="join__icon join__icon--${r.key}">${icon[r.key]}</span>
            <span class="join__title">${r.title}</span>
            <span class="join__body">${r.body}</span>
            <span class="join__cta">${r.cta} <span aria-hidden="true">→</span></span>
          </a>`).join('')}
      </div>
      <div class="join__foot">
        <span class="join__qr-wrap"><img class="join__qr" src="images/app-qr.svg" alt="QR code that opens the BetterNature app" width="200" height="200" loading="lazy" /><img class="join__qr-brand" src="logo.png" alt="" aria-hidden="true" width="36" height="36" /></span>
        <p><strong>Take Better Nature with you.</strong><br>Scan to open the app on your phone${stores ? `, or get it on ${stores}` : ''}. Already a member? <a href="${appUrl(APP_ROUTES.login)}">Sign in</a><br><button type="button" class="share-app" id="shareApp"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M12 16V3m-4 4 4-4 4 4M5 13v7h14v-7" stroke-linecap="round" stroke-linejoin="round"/></svg> Share app link</button><span class="share-status" id="shareStatus" role="status"></span></p>
      </div>
    `);
  }

  const shareApp = $('#shareApp');
  shareApp?.addEventListener('click', async () => {
    const url = `${APP_BASE}/`;
    const status = $('#shareStatus');
    try {
      if (navigator.share) { await navigator.share({title:'Better Nature', url}); status.textContent = ''; }
      else if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(url); status.textContent = 'Link copied'; }
      else throw new Error('Clipboard unavailable');
    } catch (error) {
      if (error.name === 'AbortError') return;
      status.replaceChildren();
      const input = document.createElement('input'); input.readOnly = true; input.value = url; input.setAttribute('aria-label','App link to copy'); status.append(input); input.focus(); input.select();
    }
  });

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

  // Links marked data-signup-track="business|volunteer|chapter" open the
  // matching sign-up form tab, so one form serves every "sign up" button.
  document.addEventListener('click', (e) => {
    const link = e.target.closest('[data-signup-track]');
    if (!link) return;
    const card = document.querySelector(`.join__card[data-track="${link.dataset.signupTrack}"]`);
    if (!card) return;
    card.classList.remove('is-picked');
    void card.offsetWidth;
    card.classList.add('is-picked');
  });

  // Sticky nav shadow on scroll
  const nav = $('#nav');
  const updateNav = () => nav.classList.toggle('is-scrolled', window.scrollY > 20);
  updateNav();
  window.addEventListener('scroll', updateNav, { passive: true });

  // Mobile navigation initializes independently in appearance.js.

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

  // BN Map (lazy — only mounts after scroll because libs are heavy)
  const bnmapRoot = document.getElementById('bnmapRoot');
  if (bnmapRoot && 'IntersectionObserver' in window) {
    const io3 = new IntersectionObserver(async (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io3.disconnect();
        try {
          const { mountBnMap } = await import('./bnmap.js?v=city-landmarks-1');
          mountBnMap(bnmapRoot);
        } catch (e) {
          console.warn('BN Map failed to mount', e);
          bnmapRoot.innerHTML = '<p style="text-align:center;padding:24px;color:#7A766C">Map couldn\'t load. Refresh the page to retry.</p>';
        }
      }
    }, { rootMargin: '0px 0px 200px 0px' });
    io3.observe(bnmapRoot);
  }

  // Same-page navigation is handled early by navigation.js.
})();
