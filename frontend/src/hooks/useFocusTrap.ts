import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

const FOCUSABLE =
  'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

/** Keeps keyboard focus inside `ref` while `active`, closes on Escape and restores focus afterwards. */
export function useFocusTrap(ref: RefObject<HTMLElement>, active: boolean, onEscape?: () => void): void {
  const escRef = useRef(onEscape);
  useEffect(() => {
    escRef.current = onEscape;
  }, [onEscape]);

  useEffect(() => {
    if (!active) return;
    const node = ref.current;
    if (!node) return;
    const previously = document.activeElement as HTMLElement | null;

    const focusables = () =>
      Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.hasAttribute('data-focus-skip'));

    const initial = node.querySelector<HTMLElement>('[data-autofocus]') ?? focusables()[0] ?? node;
    window.setTimeout(() => initial.focus({ preventScroll: true }), 0);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        escRef.current?.();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        node.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    node.addEventListener('keydown', onKey);
    return () => {
      node.removeEventListener('keydown', onKey);
      if (previously && typeof previously.focus === 'function') previously.focus({ preventScroll: true });
    };
  }, [ref, active]);
}
