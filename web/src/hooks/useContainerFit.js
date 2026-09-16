import { useState, useEffect, useCallback } from 'react';

/**
 * Hook that observes a container element and returns the largest
 * width × height (in CSS px) that fits inside it while preserving
 * the given aspect ratio.
 *
 * @param {React.RefObject} containerRef – ref to the container DOM node
 * @param {number|null} aspectRatio     – width / height of the content (e.g. 16/9)
 * @returns {{ width: number, height: number }}
 */
export default function useContainerFit(containerRef, aspectRatio) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  const compute = useCallback(() => {
    const el = containerRef.current;
    if (!el || !aspectRatio) return;

    // Available space (subtract padding / border via clientWidth)
    const cw = el.clientWidth;
    const ch = el.clientHeight;
    if (cw <= 0 || ch <= 0) return;

    let w, h;
    if (cw / ch > aspectRatio) {
      // Container is wider than content → height-limited
      h = ch;
      w = Math.round(ch * aspectRatio);
    } else {
      // Container is taller than content → width-limited
      w = cw;
      h = Math.round(cw / aspectRatio);
    }

    setSize((prev) => (prev.width === w && prev.height === h ? prev : { width: w, height: h }));
  }, [containerRef, aspectRatio]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    compute();

    const ro = new ResizeObserver(() => compute());
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef, compute]);

  return size;
}
