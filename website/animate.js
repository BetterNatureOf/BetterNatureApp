// Motion layer for the marketing site.
//
// Three jobs:
//   1. IntersectionObserver — adds .is-in to any [data-reveal] element
//      when it scrolls into view. Pairs with .reveal / .reveal-stagger
//      classes defined in style.css.
//   2. Count-up — any element with [data-count="N"] ticks 0 → N once
//      it's visible (so stats don't waste themselves before the user
//      scrolls there). Uses ease-out so the final number is what holds
//      the eye.
//   3. Intro classes — adds .intro-fade* to hero elements with
//      [data-intro] so the page assembles itself on load.
//
// Respects prefers-reduced-motion at both the CSS layer (instant) and
// here (no count-up animation, just snap to the final value).

(function () {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ─── 1. Scroll reveal ────────────────────────────────────────────
  // Mark targets that opted in via [data-reveal] or [data-reveal-stagger].
  // Anything matching gets the .reveal class so it starts hidden, then
  // .is-in once it crosses ~12% into the viewport.
  const reveals = document.querySelectorAll('[data-reveal], [data-reveal-stagger]');
  reveals.forEach((el) => {
    if (el.hasAttribute('data-reveal-stagger')) el.classList.add('reveal-stagger');
    else el.classList.add('reveal');
  });

  if (reducedMotion) {
    // Skip the observer entirely — show everything immediately.
    reveals.forEach((el) => el.classList.add('is-in'));
  } else if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in');
            io.unobserve(entry.target); // one-shot — never re-hide
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add('is-in'));
  }

  // ─── 2. Count-up ─────────────────────────────────────────────────
  // Cubic ease-out so the number decelerates into its final value
  // instead of crawling there linearly.
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

  function countUp(el) {
    const target = parseFloat(el.dataset.count);
    if (Number.isNaN(target)) return;
    if (reducedMotion) { el.textContent = formatNum(target, el); return; }

    const duration = parseInt(el.dataset.countDuration || '900', 10);
    const start = performance.now();

    function frame(now) {
      const t = Math.min(1, (now - start) / duration);
      const v = target * easeOutCubic(t);
      el.textContent = formatNum(v, el);
      if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function formatNum(v, el) {
    const decimals = parseInt(el.dataset.countDecimals || '0', 10);
    const rounded = decimals > 0 ? v.toFixed(decimals) : Math.round(v);
    const sep = el.dataset.countSep !== 'false';
    return sep ? Number(rounded).toLocaleString('en-US') : String(rounded);
  }

  const counters = document.querySelectorAll('[data-count]');
  counters.forEach((el) => {
    el.classList.add('count-up');
    el.textContent = el.dataset.countStart || '0';
  });

  if ('IntersectionObserver' in window) {
    const cio = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            countUp(entry.target);
            cio.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.4 }
    );
    counters.forEach((el) => cio.observe(el));
  } else {
    counters.forEach(countUp);
  }

  // ─── 3. Intro fade ───────────────────────────────────────────────
  // Map [data-intro="1|2|3"] onto the intro-fade-{n} delay classes.
  // Anything with [data-intro] gets the base class too.
  document.querySelectorAll('[data-intro]').forEach((el) => {
    el.classList.add('intro-fade');
    const stage = el.dataset.intro;
    if (stage) el.classList.add('intro-fade-' + stage);
  });
})();
