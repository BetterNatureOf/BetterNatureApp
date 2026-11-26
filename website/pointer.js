// iPad-inspired adaptive pointer. Progressive enhancement for mouse/trackpad only.
(() => {
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const transparency = matchMedia('(prefers-reduced-transparency: reduce)');
  const contrast = matchMedia('(forced-colors: active)');
  const bubble = document.createElement('div');
  bubble.className = 'bn-pointer'; bubble.setAttribute('aria-hidden','true'); document.body.append(bubble);
  let frame = 0, point = null, visible = false, active = null, baseRect = null;
  const returns = new Map();
  function releaseControl(spring = true) {
    if (active) {
      const control = active;
      const dx = parseFloat(control.style.getPropertyValue('--pointer-x')) || 0;
      const dy = parseFloat(control.style.getPropertyValue('--pointer-y')) || 0;
      control.classList.remove('bn-jelly');
      control.style.removeProperty('--pointer-x'); control.style.removeProperty('--pointer-y');
      if (spring && enabled() && control.animate) {
        const animation = control.animate([
          {translate:`${dx}px ${dy}px`, scale:'1.025', offset:0},
          {translate:`${-dx * .28}px ${-dy * .28}px`, scale:'.995', offset:.45},
          {translate:`${dx * .09}px ${dy * .09}px`, scale:'1.003', offset:.72},
          {translate:'0px 0px', scale:'1', offset:1}
        ], {duration:420, easing:'ease-out'});
        returns.set(control, animation);
        animation.onfinish = () => returns.delete(control);
      }
    }
    active = null; baseRect = null;
  }
  const enabled = () => fine.matches && !reduced.matches && !contrast.matches && !transparency.matches;
  const native = 'dialog, input, textarea, select, iframe, [contenteditable="true"]';
  function reset() { releaseControl(false); returns.forEach(animation => animation.cancel()); returns.clear(); visible = false; document.documentElement.classList.remove('bn-pointer-on'); bubble.classList.remove('is-visible'); }
  function render() {
    frame = 0;
    if (!point || !enabled() || document.hidden) return reset();
    const target = document.elementFromPoint(point.x, point.y);
    if (!target || target.closest(native)) return reset();
    let x = point.x - 9, y = point.y - 9, width = 18, height = 18, radius = 12;
    const control = target.closest('a, button, summary, [role="button"]');
    const text = !control && target.closest('h1,h2,h3,h4,p,li,label,small');
    if (control !== active) releaseControl();
    if (control && !control.disabled) {
      if (!active) { returns.get(control)?.cancel(); returns.delete(control); active = control; baseRect = control.getBoundingClientRect(); }
      const rect = baseRect;
      const dx = Math.max(-9, Math.min(9, (point.x - rect.left - rect.width / 2) * .14));
      const dy = Math.max(-7, Math.min(7, (point.y - rect.top - rect.height / 2) * .14));
      if (rect.width < 360 && rect.height < 120) {
        control.classList.add('bn-jelly');
        control.style.setProperty('--pointer-x', `${dx}px`); control.style.setProperty('--pointer-y', `${dy}px`);
      }
      if (rect.width < 360 && rect.height < 120) {
        x = rect.left - 6 + dx; y = rect.top - 6 + dy; width = rect.width + 12; height = rect.height + 12;
        radius = Math.min(22, parseFloat(getComputedStyle(control).borderRadius) || 12);
      }
    } else if (text) { x = point.x - 1.5; y = point.y - 12; width = 3; height = 24; radius = 2; }
    bubble.style.cssText = `width:${width}px;height:${height}px;border-radius:${radius}px;transform:translate3d(${x}px,${y}px,0)`;
    const engulfed = !!control && control.classList.contains('bn-jelly');
    bubble.classList.toggle('is-control', engulfed);
    bubble.classList.toggle('is-text', !!text);
    bubble.classList.toggle('is-map', !!target.closest('path.country,path.state'));
    bubble.classList.add('is-visible'); document.documentElement.classList.add('bn-pointer-on'); visible = true;
  }
  document.addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse') return reset();
    point = {x:event.clientX,y:event.clientY};
    if (!frame) frame = requestAnimationFrame(render);
  }, {passive:true});
  document.addEventListener('pointerdown', () => bubble.classList.add('is-pressed'));
  document.addEventListener('pointerup', () => bubble.classList.remove('is-pressed'));
  document.addEventListener('keydown', () => { point = null; reset(); });
  document.addEventListener('pointerleave', reset); addEventListener('blur', reset);
  addEventListener('scroll', () => { releaseControl(); if (visible && !frame) frame = requestAnimationFrame(render); }, {passive:true});
  document.addEventListener('visibilitychange', () => { if (document.hidden) reset(); });
  [fine,reduced,contrast,transparency].forEach(media => media.addEventListener('change', reset));
  addEventListener('pagehide', () => { if (frame) cancelAnimationFrame(frame); reset(); });
})();
