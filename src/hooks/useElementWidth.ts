import { useCallback, useRef, useState } from 'react';

/**
 * Live width of an element. Use it to lay out by the space a component actually has
 * (e.g. when a side drawer narrows the page) instead of by the window width.
 * Starts at Infinity so the first paint uses the wide layout until measured.
 */
export function useElementWidth<T extends HTMLElement>(): [(el: T | null) => void, number] {
  const [width, setWidth] = useState(Number.POSITIVE_INFINITY);
  const observer = useRef<ResizeObserver | null>(null);

  const ref = useCallback((el: T | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    if (typeof ResizeObserver === 'undefined') return;
    observer.current = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.current.observe(el);
  }, []);

  return [ref, width];
}
