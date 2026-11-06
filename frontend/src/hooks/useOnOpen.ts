import { useEffect, useRef } from 'react';

/** Runs `fn` once each time `open` turns true (e.g. to reset a form when a dialog opens). */
export function useOnOpen(open: boolean, fn: () => void): void {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const was = useRef(false);
  useEffect(() => {
    if (open && !was.current) fnRef.current();
    was.current = open;
  }, [open]);
}
