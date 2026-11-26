// Official public-profile embed. No private Instagram token is used in this site.
const root = document.querySelector('#impactInstagram');
if (root) {
  const mount = root.querySelector('#instagramEmbed');
  const status = root.querySelector('#instagramStatus');
  const retry = root.querySelector('#instagramRetry');
  let busy = false, complete = false, scriptPromise, attempt = 0;
  function profileURL() {
    try {
      const value = new URL(window.CONTENT?.brand?.instagram || 'https://www.instagram.com/official.better.nature/');
      const name = value.pathname.split('/').filter(Boolean);
      if (['instagram.com','www.instagram.com'].includes(value.hostname) && name.length === 1 && /^[a-zA-Z0-9._]{1,30}$/.test(name[0])) return new URL(`https://www.instagram.com/${name[0]}/`);
    } catch {}
    return new URL('https://www.instagram.com/official.better.nature/');
  }
  function embedScript() {
    if (window.instgrm?.Embeds) return Promise.resolve();
    if (!scriptPromise) scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://www.instagram.com/embed.js'; script.async = true;
      const deadline = setTimeout(() => { script.remove(); scriptPromise = null; reject(new Error('Instagram embed timed out')); }, 30000);
      script.onload = () => { clearTimeout(deadline); resolve(); }; script.onerror = () => { clearTimeout(deadline); script.remove(); scriptPromise = null; reject(new Error('Instagram embed unavailable')); };
      document.head.append(script);
    });
    return scriptPromise;
  }
  async function load() {
    if (busy || complete) return;
    const run = ++attempt; let frameObserver;
    busy = true; retry.hidden = true; status.textContent = 'Loading Instagram posts…'; mount.replaceChildren();
    const profile = profileURL();
    root.querySelectorAll('.instagram-profile').forEach(link => { link.href = profile.href; link.textContent = `@${profile.pathname.split('/')[1]} ↗`; });
    try {
      // Instagram's native renderer reads this public profile permalink directly.
      // Keeping the embed local avoids an extra oEmbed request on every page visit.
      const quote = document.createElement('blockquote'); quote.className = 'instagram-media';
      quote.dataset.instgrmPermalink = profile.href; quote.dataset.instgrmVersion = '14';
      const link = document.createElement('a'); link.href = profile.href; link.textContent = 'View our posts on Instagram'; link.target = '_blank'; link.rel = 'noopener noreferrer'; quote.append(link); mount.append(quote);
      frameObserver = new MutationObserver(() => {
        const frame = mount.querySelector('iframe');
        if (!frame) return;
        frameObserver.disconnect(); frame.title = 'BetterNature posts on Instagram';
        frame.addEventListener('load', () => { if (run !== attempt) return; status.textContent = ''; complete = true; busy = false; }, {once:true});
      });
      frameObserver.observe(mount, {childList:true,subtree:true});
      await embedScript(); window.instgrm.Embeds.process();
      setTimeout(() => {
        frameObserver.disconnect();
        if (run !== attempt) return;
        if (!complete) { busy = false; status.textContent = 'Posts may be blocked by this browser. You can also view them on Instagram.'; retry.hidden = false; }
      }, 15000);
    } catch {
      frameObserver?.disconnect();
      if (!window.instgrm?.Embeds) scriptPromise = null;
      if (run !== attempt) return;
      status.textContent = 'Instagram couldn’t load here. View our posts on Instagram, or try again.';
      retry.hidden = false; busy = false;
    }
  }
  retry.addEventListener('click', load);
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); load(); }
    }, {rootMargin:'100px'});
    observer.observe(root);
  } else load();
}
