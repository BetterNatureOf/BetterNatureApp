import { animate } from 'animejs/animation';
// This entrance belongs only to the explorer; existing Motion never targets it.
export function enterExplorer(element) {
  const animation = animate(element.querySelectorAll('.network__intro, .network__data'), {
    opacity: { from: .5, to: 1 }, translateY: { from: 10, to: 0 },
    duration: 360, ease: 'outQuart', delay: (_, index) => index * 60,
  });
  return () => animation.revert();
}
