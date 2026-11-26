// Optional detail remains open on desktop, while phones start with a clear overview.
(() => {
  const mobile = matchMedia('(max-width:767px)');
  const enhanced = new WeakSet();
  function init() {
    document.querySelectorAll('details[data-mobile-disclosure]').forEach(details => {
      if (enhanced.has(details)) return;
      enhanced.add(details);
      let mobileChoice = false;
      const apply = () => { details.open = mobile.matches ? mobileChoice : true; };
      details.addEventListener('toggle', () => { if (mobile.matches) mobileChoice = details.open; });
      mobile.addEventListener('change', apply);
      apply();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true}); else init();
  window.addEventListener('bn:content-ready', init);
})();
