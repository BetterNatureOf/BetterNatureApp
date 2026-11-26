// One offset calculation for desktop, mobile and direct section links.
(() => {
  const nav = document.querySelector('#nav');
  if (!nav) return;
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clearance = () => Math.ceil(nav.getBoundingClientRect().bottom) + 24;
  function updateOffset() { if (!nav.classList.contains('is-open')) document.documentElement.style.setProperty('--anchor-offset', `${clearance()}px`); }
  new ResizeObserver(updateOffset).observe(nav);
  addEventListener('resize', updateOffset); updateOffset();
  function navigate(id, behavior, focus) {
    const target = document.getElementById(id);
    if (!target || target.hidden) return false;
    nav.classList.remove('is-open');
    document.querySelector('#burger')?.setAttribute('aria-expanded', 'false');
    document.querySelector('#navMoreBtn')?.setAttribute('aria-expanded', 'false');
    nav.querySelector('.nav__more')?.classList.remove('is-open');
    // Read after the mobile sheet collapses, never subtract its expanded height.
    const anchor = target.querySelector(':scope > .container') || target;
    const top = id === 'top' ? 0 : Math.max(0, anchor.getBoundingClientRect().top + scrollY - clearance());
    if (focus) { if (!target.hasAttribute('tabindex')) target.tabIndex = -1; target.focus({preventScroll:true}); }
    window.scrollTo({top, behavior});
    return true;
  }
  document.addEventListener('click', event => {
    const link = event.target.closest('a[href^="#"]');
    if (!link || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const hash = link.getAttribute('href');
    if (!hash || hash === '#') return;
    let id; try { id = decodeURIComponent(hash.slice(1)); } catch { return; }
    if (!navigate(id, reduced() ? 'instant' : 'smooth', true)) return;
    event.preventDefault();
    if (location.hash !== hash) history.pushState(null, '', hash);
  });
  addEventListener('popstate', () => { if (location.hash) navigate(decodeURIComponent(location.hash.slice(1)), 'instant', false); });
  // The CMS paints section content asynchronously. Resolve a direct link only once it has content.
  if (location.hash) {
    const id = decodeURIComponent(location.hash.slice(1));
    const observer = new MutationObserver(() => {
      const target = document.getElementById(id);
      if (target?.textContent.trim()) { observer.disconnect(); requestAnimationFrame(() => navigate(id, 'instant', false)); }
    });
    observer.observe(document.querySelector('main'), {childList:true, subtree:true});
    setTimeout(() => observer.disconnect(), 15000);
  }
})();
