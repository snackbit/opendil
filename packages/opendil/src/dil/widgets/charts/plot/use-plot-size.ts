import { useCallback, useRef, useState, useSyncExternalStore } from "react";

const STOCK_WIDTH = 640;
/**
 * A chart draws at a width before its container has been measured. The
 * charts of a page are mostly equally wide, so the width charts last
 * measured is usually right, and the first paint needs no second render.
 */
let measuredWidth = STOCK_WIDTH;
const unchanging = () => () => {};
const readMeasuredWidth = () => measuredWidth;
// Server markup and its hydration use the stock width.
const readStockWidth = () => STOCK_WIDTH;

/** The container's width, from the ref callback this returns with it. */
export function usePlotWidth(): [
  width: number,
  attach: (element: HTMLElement | null) => void,
] {
  const hinted = useSyncExternalStore(
    unchanging,
    readMeasuredWidth,
    readStockWidth,
  );
  const [width, setWidth] = useState(hinted);
  const observer = useRef<ResizeObserver | null>(null);
  const attach = useCallback((element: HTMLElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!element || typeof ResizeObserver !== "function") return;
    // Observations arrive after layout and before paint, so the width is
    // read without forcing layout and a correction is never seen.
    const next = new ResizeObserver(([entry]) => {
      const measured = Math.round(entry?.contentRect.width ?? 0);
      // A hidden chart has no width; it keeps the one it last drew at.
      if (measured <= 0) return;
      measuredWidth = measured;
      setWidth(measured);
    });
    next.observe(element);
    observer.current = next;
  }, []);
  return [width, attach];
}
