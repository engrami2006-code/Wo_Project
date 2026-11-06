import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from './useReducedMotion';

/**
 * Animates from the previous value to `target`. Only call it with real, fetched values:
 * `null` short-circuits so missing data is never animated or invented.
 */
export function useCountUp(target: number | null | undefined, durationMs = 700): number | null {
  const reduced = useReducedMotion();
  const [value, setValue] = useState<number | null>(typeof target === 'number' ? (reduced ? target : 0) : null);
  const fromRef = useRef(0);

  useEffect(() => {
    if (typeof target !== 'number' || !Number.isFinite(target)) {
      setValue(null);
      return;
    }
    if (reduced || typeof window.requestAnimationFrame !== 'function') {
      setValue(target);
      fromRef.current = target;
      return;
    }
    const from = fromRef.current;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(from + (target - from) * eased);
      if (p < 1) frame = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, reduced, durationMs]);

  return value;
}
