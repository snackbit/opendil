import { useLayoutEffect, type RefObject } from "react";
import type { DilDocument } from "./runtime/document";
import type { RendererViewport } from "./renderer-environment";
import { recordWidgetHeights, watchWidgetHeights } from "./document-cache";

/**
 * A finished document that has not settled yet keeps the height of its first
 * frame until it settles, so the page around it moves once: values, lazily
 * loaded widgets and diagrams fill in inside the held box. A reader's input
 * inside it, a new width, or this limit ends the hold early.
 */
export const LAYOUT_HOLD_LIMIT_MS = 1500;
// Interaction that can change the answer's content. Scrolling over it, by
// wheel or touch, keeps the hold, so the page does not move under the reader.
const INPUT = ["click", "keydown", "focusin"] as const;

/**
 * A lazily loaded widget (a chart, graph or diagram) holds a reserved height
 * while it loads; its placeholder carries the widget's name. Outside the
 * visible area it does not keep the document from settling: the reader cannot
 * see it fill in, and its reserve keeps the text around it in place. A value
 * placeholder, or a widget in view, still does. A visible area of height 0,
 * which a host renderer reports while it has no scroll root, defers nothing.
 */
function blocksSettle(
  placeholder: Element,
  top: number,
  viewport: RendererViewport,
) {
  if (!placeholder.hasAttribute("data-dil-pending-name")) return true;
  const { height, offset } = viewport;
  if (height <= 0) return true;
  const box = placeholder.getBoundingClientRect();
  return box.bottom - top > offset && box.top - top < offset + height;
}

export interface SettledReports {
  /** The answer has the final layout the reader can see. */
  settled: () => void;
  /** The widgets that were out of view at settle have laid out since. */
  widgetsLaidOut: () => void;
}

/**
 * Marks the renderer root with `data-dil-settled` and reports once when the
 * complete document has its final visible layout: no evaluation is queued or
 * running and no placeholder in view is pending. Lazily loaded widgets out of
 * view keep their reserved height and do not delay it. A document whose
 * runtime stopped is final too. Hosts use it to reveal or position an answer
 * without watching it fill in. Widget heights are recorded at the renderer's
 * width for the placeholders of a later mount, at settle and, when widgets
 * were still loading then, again once they have laid out.
 *
 * With `hold`, for an answer that was finished when it mounted, the root keeps
 * its first frame's height (`data-dil-held`) until it settles.
 */
export function useSettledSignal(
  root: RefObject<HTMLElement | null>,
  document: DilDocument | null,
  reports: SettledReports,
  hold: boolean,
  viewport: RendererViewport,
) {
  useLayoutEffect(() => {
    const element = root.current;
    if (!element || !document) return;
    element.dataset.dilSettled = "false";
    const width = () => Math.round(element.getBoundingClientRect().width);
    // Placeholders rendered before layout reserve the heights measured at
    // this width; the ones that change render again before the first paint.
    document.heights.width.setState({ width: width() });
    let frame = 0;
    let settled = false;
    let finished = false;
    let unwatch = () => {};
    let held: {
      timer: ReturnType<typeof setTimeout>;
      resize: ResizeObserver | undefined;
    } | null = null;
    function release() {
      if (!held || !element) return;
      clearTimeout(held.timer);
      held.resize?.disconnect();
      held = null;
      for (const type of INPUT) element.removeEventListener(type, release);
      element.style.height = "";
      element.style.overflow = "";
      delete element.dataset.dilHeld;
    }
    // Checked once per frame, after that frame's results have committed.
    const check = () => {
      frame = 0;
      if (
        finished ||
        !document.status.getState().complete ||
        !document.engine.idle
      )
        return;
      // A stopped runtime cannot resolve the placeholders it left behind.
      const pending = document.engine.stopped
        ? []
        : element.querySelectorAll("[data-dil-pending]");
      const settling = !settled;
      if (settling) {
        const top = element.getBoundingClientRect().top;
        for (const placeholder of pending)
          if (blocksSettle(placeholder, top, viewport)) return;
        settled = true;
        document.settledOnce = true;
        // Its results are confirmed; a renderer that adopts it later shows its
        // own final layout, so its charts mount in the first commit.
        document.seeded = false;
        release();
        element.dataset.dilSettled = "true";
      }
      finished = pending.length === 0;
      if (!settling && !finished) return;
      // Recorded at settle too, so a renderer that adopts the document while
      // a widget still loads reserves the heights measured so far.
      const settledWidth = width();
      recordWidgetHeights(document, settledWidth);
      if (finished) {
        stop();
        unwatch = watchWidgetHeights(document, width, settledWidth);
      }
      if (settling) reports.settled();
      else reports.widgetsLaidOut();
    };
    const schedule = () => {
      if (!frame && !finished) frame = requestAnimationFrame(check);
    };
    // Runs before the first paint, so the held height is the one readers see.
    const first = requestAnimationFrame(() => {
      check();
      const height = element.getBoundingClientRect().height;
      if (settled || !hold || height <= 0) return;
      const heldWidth = width();
      // Some test DOMs have no ResizeObserver; the limit still ends the hold.
      const resize =
        typeof ResizeObserver === "function"
          ? new ResizeObserver(() => {
              if (width() !== heldWidth) release();
            })
          : undefined;
      held = {
        timer: setTimeout(release, LAYOUT_HOLD_LIMIT_MS),
        resize,
      };
      element.style.height = height + "px";
      element.style.overflow = "clip";
      element.dataset.dilHeld = "true";
      resize?.observe(element);
      for (const type of INPUT)
        element.addEventListener(type, release, { passive: true });
    });
    // Lazy widgets replace their placeholders without any document change.
    const observer = new MutationObserver(schedule);
    observer.observe(element, { childList: true, subtree: true });
    const unsubscribeStatus = document.status.subscribe(schedule);
    const unsubscribeBindings = document.engine.store.subscribe(schedule);
    // Visibility is read when content changes, not on scroll: a widget in
    // view settles the answer once it lays out, wherever the reader is then.
    document.engine.events.addEventListener("dil:idle", schedule);
    function stop() {
      observer.disconnect();
      unsubscribeStatus();
      unsubscribeBindings();
      document?.engine.events.removeEventListener("dil:idle", schedule);
    }
    return () => {
      stop();
      unwatch();
      release();
      cancelAnimationFrame(first);
      cancelAnimationFrame(frame);
    };
  }, [root, document, reports, hold, viewport]);
}
