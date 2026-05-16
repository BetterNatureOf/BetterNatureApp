// Number that counts up to its target value. Used on dashboards/stat
// cards so the page feels alive when it lands. Duration is short
// (700ms) and easing is decel — fast start, slow finish — so the
// final value is what holds the eye.
import React, { useEffect, useRef, useState } from 'react';
import { Text } from 'react-native';

export default function AnimatedNumber({ value = 0, duration = 700, suffix = '', style }) {
  const [display, setDisplay] = useState(0);
  const start = useRef(0);
  const startTime = useRef(0);
  const raf = useRef(null);

  useEffect(() => {
    start.current = display;
    startTime.current = Date.now();
    const target = Number(value) || 0;

    function step() {
      const t = Math.min(1, (Date.now() - startTime.current) / duration);
      // Cubic ease-out — fast start, decelerates into the final number.
      const eased = 1 - Math.pow(1 - t, 3);
      const v = Math.round(start.current + (target - start.current) * eased);
      setDisplay(v);
      if (t < 1) raf.current = requestAnimationFrame(step);
    }
    raf.current = requestAnimationFrame(step);
    return () => raf.current && cancelAnimationFrame(raf.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);

  return <Text style={style}>{display.toLocaleString('en-US')}{suffix}</Text>;
}
