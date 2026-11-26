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
    const links = nav.querySelector('#navLinks');
    const syncMenuButton = () => {
      const open = burger.getAttribute('aria-expanded') === 'true';
      burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      const label = burger.querySelector('.nav__menuLabel');
      if (label) label.textContent = open ? 'Close' : 'Menu';
    };
    new MutationObserver(syncMenuButton).observe(burger, {attributes:true,attributeFilter:['aria-expanded']});
    syncMenuButton();
    let drawerMotion;
    const setOpen = open => {
      const wasOpen = nav.classList.contains('is-open');
      if (open === wasOpen && !drawerMotion) return;
      const current = links && wasOpen ? getComputedStyle(links) : null;
      const from = {opacity: current ? current.opacity : '0', transform: current ? current.transform : 'translateY(-5px)'};
      drawerMotion?.cancel(); drawerMotion = null;
      burger.setAttribute('aria-expanded', String(open));
      syncMenuButton();
      if (open) nav.classList.add('is-open');
      if (!links || !matchMedia('(max-width:1120px)').matches || matchMedia('(prefers-reduced-motion:reduce)').matches) {
        nav.classList.toggle('is-open', open); return;
      }
      if (!open && !wasOpen) return;
      // Capture the current frame so rapid reversals never jump to the start.
      drawerMotion = links.animate([from, open ? {opacity:1,transform:'translateY(0)'} : {opacity:0,transform:'translateY(-3px)'}], {
        duration:open ? 180 : 100, easing:open ? 'cubic-bezier(.16,1,.3,1)' : 'cubic-bezier(.7,0,.84,0)'
      });
      drawerMotion.onfinish = () => { if (!open) nav.classList.remove('is-open'); drawerMotion = null; };
    };
    burger.addEventListener('click', event => {
      const open = burger.getAttribute('aria-expanded') !== 'true';
      setOpen(open);
      if (open && event.detail === 0) nav.querySelector('#navLinks a:not([style*="display: none"])')?.focus();
    });
    document.addEventListener('click', event => { if (!nav.contains(event.target) && !event.target.closest('.bn-select__menu[data-nav-popover]')) setOpen(false); });
    matchMedia('(min-width:1121px)').addEventListener('change', () => setOpen(false));
    nav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => setOpen(false)));
    nav.addEventListener('keydown', event => { if (event.key === 'Escape' && nav.classList.contains('is-open')) { setOpen(false); burger.focus(); } });
  }, { once: true });
  apply();
})();
