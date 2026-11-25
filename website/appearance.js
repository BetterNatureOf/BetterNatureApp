// Runs before styles to avoid a light flash on dark devices.
(() => {
  const root = document.documentElement;
  const media = matchMedia('(prefers-color-scheme: dark)');
  const key = 'bn.appearance';
  const valid = value => ['system', 'light', 'dark'].includes(value);
  let preference = 'system';
  try { const saved = localStorage.getItem(key); if (valid(saved)) preference = saved; } catch {}
  function apply() {
    const theme = preference === 'system' ? (media.matches ? 'dark' : 'light') : preference;
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    document.querySelectorAll('[data-appearance]').forEach(select => { select.value = preference; });
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#111c17' : '#f8faf6');
    window.dispatchEvent(new CustomEvent('bn:appearance', { detail: { theme, preference } }));
  }
  media.addEventListener('change', () => { if (preference === 'system') apply(); });
  addEventListener('storage', event => {
    if (event.key !== key && event.key !== null) return;
    preference = valid(event.newValue) ? event.newValue : 'system'; apply();
  });
  document.addEventListener('change', event => {
    if (!event.target.matches('[data-appearance]')) return;
    preference = valid(event.target.value) ? event.target.value : 'system';
    try { localStorage.setItem(key, preference); } catch {}
    apply();
  });
  document.addEventListener('DOMContentLoaded', () => {
    apply();
    // Navigation must work before remote CMS/directory requests finish.
    const nav = document.querySelector('#nav');
    const burger = document.querySelector('#burger');
    if (!nav || !burger) return;
    const setOpen = open => { nav.classList.toggle('is-open', open); burger.setAttribute('aria-expanded', String(open)); };
    burger.addEventListener('click', () => setOpen(!nav.classList.contains('is-open')));
    nav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => setOpen(false)));
    nav.addEventListener('keydown', event => { if (event.key === 'Escape' && nav.classList.contains('is-open')) { setOpen(false); burger.focus(); } });
  }, { once: true });
  apply();
})();
