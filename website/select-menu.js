// Progressive enhancement: original selects remain the source of truth.
// Browsers without Popover API keep the styled native controls.
(() => {
  function enhance(select) {
    if (!HTMLElement.prototype.showPopover || select.dataset.enhanced) return;
    select.dataset.enhanced = 'true';
    const shell = document.createElement('span'); shell.className = 'bn-select';
    select.before(shell); shell.append(select);
    const label = select.getAttribute('aria-label') || document.querySelector(`label[for="${select.id}"]`)?.textContent.trim() || 'View';
    const trigger = document.createElement('button'); trigger.type = 'button'; trigger.className = 'bn-select__trigger';
    const labelSpan = document.createElement('span');
    trigger.append(labelSpan); trigger.insertAdjacentHTML('beforeend','<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>');
    const menu = document.createElement('div'); menu.className = 'bn-select__menu'; menu.popover = 'manual'; menu.id = `bn-select-${select.id || 'appearance'}`; menu.setAttribute('role','listbox'); menu.setAttribute('aria-label',label); if(select.closest('#nav')) menu.dataset.navPopover='true'; document.body.append(menu);
    trigger.setAttribute('aria-haspopup','listbox'); trigger.setAttribute('aria-controls',menu.id); trigger.setAttribute('aria-expanded','false'); shell.append(trigger);
    select.hidden = true;
    let active = 0, isOpen = false, options = [], typed = '', typedAt = 0;
    function sync() {
      const selected = select.selectedOptions[0]; labelSpan.textContent = selected?.textContent || '';
      trigger.setAttribute('aria-label',`${label}: ${labelSpan.textContent}`); trigger.disabled = select.disabled;
      options.forEach((button,i) => { button.setAttribute('aria-selected',String(select.options[i].selected)); button.tabIndex = select.options[i].selected ? 0 : -1; });
    }
    function close(focus = false) { if (!isOpen) return; isOpen=false; menu.hidePopover(); trigger.setAttribute('aria-expanded','false'); if(focus) trigger.focus({preventScroll:true}); }
    function position() {
      if (!isOpen) return;
      const r=trigger.getBoundingClientRect();
      if (!r.width || r.bottom<0 || r.top>innerHeight) return close();
      menu.style.width=`${Math.min(Math.max(r.width,190),innerWidth-24)}px`;
      const h=menu.getBoundingClientRect().height;
      menu.style.left=`${Math.max(12,Math.min(r.left,innerWidth-menu.offsetWidth-12))}px`;
      menu.style.top=`${r.bottom+h+8<=innerHeight-12 ? r.bottom+8 : Math.max(12,r.top-h-8)}px`;
    }
    function focusOption(index) { active=(index+options.length)%options.length; options.forEach((button,i)=>button.tabIndex=i===active?0:-1); options[active]?.focus({preventScroll:true}); }
    function open(index = select.selectedIndex) {
      if (isOpen) return;
      menu.replaceChildren();
      options=[...select.options].map((option,i)=>{
        const button=document.createElement('button'); button.type='button'; button.className='bn-select__option';button.setAttribute('role','option');button.textContent=option.textContent;button.insertAdjacentHTML('beforeend','<span class="bn-select__check" aria-hidden="true">✓</span>');button.disabled=option.disabled;
        button.addEventListener('click',()=>{select.value=option.value;select.dispatchEvent(new Event('input',{bubbles:true}));select.dispatchEvent(new Event('change',{bubbles:true}));sync();close(true);});menu.append(button);return button;
      });
      sync();isOpen=true;menu.showPopover();trigger.setAttribute('aria-expanded','true');position();focusOption(index);
    }
    trigger.addEventListener('click',event=>{ event.preventDefault();isOpen?close():open(); });
    trigger.addEventListener('keydown',event=>{if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();open(event.key==='ArrowUp'?select.options.length-1:select.selectedIndex);}});
    menu.addEventListener('keydown',event=>{
      if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();focusOption(event.key==='Home'?0:event.key==='End'?options.length-1:active+(event.key==='ArrowDown'?1:-1));}
      else if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);}
      else if(event.key==='Tab'){close();trigger.focus({preventScroll:true});}
      else if(event.key.length===1&&!event.ctrlKey&&!event.metaKey&&event.key!==' '){const now=performance.now();typed=now-typedAt>700?event.key:typed+event.key;typedAt=now;const index=options.findIndex(option=>option.textContent.toLowerCase().startsWith(typed.toLowerCase()));if(index>=0)focusOption(index);}
    });
    document.addEventListener('pointerdown',event=>{if(isOpen&&!menu.contains(event.target)&&!shell.contains(event.target))close();});
    document.addEventListener('focusin',event=>{if(isOpen&&!menu.contains(event.target)&&!shell.contains(event.target))close();});
    select.addEventListener('change',sync);window.addEventListener('bn:appearance',sync);
    window.addEventListener('resize',position);document.addEventListener('scroll',position,{passive:true,capture:true});
    // The header may close while an appearance menu is open.
    const nav=select.closest('#nav');if(nav)new MutationObserver(()=>{if(!nav.classList.contains('is-open'))close();}).observe(nav,{attributes:true,attributeFilter:['class']});
    sync();
  }
  function init(){document.querySelectorAll('[data-appearance],#networkMetric,#chapterSort').forEach(enhance);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
