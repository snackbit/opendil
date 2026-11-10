import { useCallback, useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  useCollisionPadding,
  usePortalScope,
  type CollisionPadding,
} from "../../../components/ui/overlays/ui-scope";

export interface ChartPointTooltipProps {
  open: boolean;
  x: number;
  y: number;
  children: ReactNode;
  onClose(): void;
}
/** Distance between the pointer and the tooltip. */
const GAP = 12;
/**
 * What pointer movement cannot change: the tooltip's size, where its
 * containing block starts, and the area it must stay in. Reading them forces
 * layout, so they are measured once per opening and again only after a
 * resize; a pointer move is then arithmetic and one style write.
 */
interface Geometry {
  width: number;
  height: number;
  /** Viewport position of the tooltip's untransformed top left corner. */
  originX: number;
  originY: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
}
function measure(
  element: HTMLElement,
  shift: { x: number; y: number } | null,
  boundary: Element | undefined,
  padding: CollisionPadding,
): Geometry {
  const box = element.getBoundingClientRect();
  const root = element.ownerDocument.documentElement;
  const area = boundary?.getBoundingClientRect() ?? {
    left: 0,
    top: 0,
    right: root.clientWidth,
    bottom: root.clientHeight,
  };
  const side = (name: "top" | "right" | "bottom" | "left") =>
    typeof padding === "number" ? padding : (padding[name] ?? 0);
  return {
    width: box.width,
    height: box.height,
    // A transformed ancestor contains fixed descendants, so the origin is
    // measured: the box as laid out, less the translation applied to it.
    // Parked out of view, that translation is twice its height upwards.
    originX: box.left - (shift?.x ?? 0),
    originY: box.top - (shift?.y ?? -2 * box.height),
    left: area.left + side("left"),
    top: area.top + side("top"),
    right: area.right - side("right"),
    bottom: area.bottom - side("bottom"),
  };
}
/**
 * Below and right of the pointer. It moves above when that overflows less,
 * and slides along the horizontal edge it would cross.
 */
function place(geometry: Geometry, x: number, y: number) {
  let top = y + GAP;
  let side = "bottom";
  const below = top + geometry.height - geometry.bottom;
  const above = y - GAP - geometry.height;
  if (below > 0 && geometry.top - above < below) {
    top = above;
    side = "top";
  }
  const left = Math.max(
    geometry.left,
    Math.min(x, geometry.right - geometry.width),
  );
  return {
    x: Math.round(left - geometry.originX),
    y: Math.round(top - geometry.originY),
    side,
  };
}

/** A passive pointer tooltip needs positioning, not popover focus and dismissal scopes. */
export function ChartPointTooltip({
  open,
  x,
  y,
  children,
  onClose,
}: ChartPointTooltipProps) {
  const { container, boundary } = usePortalScope();
  const padding = useCollisionPadding(8);
  const floating = useRef<HTMLDivElement | null>(null);
  const pointer = useRef({ open, x, y });
  const geometry = useRef<Geometry | null>(null);
  /** The translation on the element now; null while it is parked out of view. */
  const shift = useRef<{ x: number; y: number } | null>(null);
  // A new element starts parked, as its inline style says.
  const attach = useCallback((element: HTMLDivElement | null) => {
    floating.current = element;
    shift.current = null;
    geometry.current = null;
  }, []);
  const position = useCallback(() => {
    const element = floating.current;
    if (!element) return;
    if (!pointer.current.open) {
      geometry.current = null;
      // Already parked, as on every render of a chart nobody hovers.
      if (!shift.current) return;
      shift.current = null;
      element.style.visibility = "hidden";
      element.style.transform = "translate(0, -200%)";
      return;
    }
    geometry.current ??= measure(element, shift.current, boundary, padding);
    const next = place(geometry.current, pointer.current.x, pointer.current.y);
    if (shift.current?.x !== next.x || shift.current.y !== next.y)
      element.style.transform = `translate(${next.x}px, ${next.y}px)`;
    if (!shift.current) element.style.visibility = "visible";
    shift.current = next;
    element.dataset.side = next.side;
  }, [boundary, padding]);
  /** After anything that can change the tooltip's size or the room around it. */
  const remeasure = useCallback(() => {
    geometry.current = null;
    position();
  }, [position]);

  // Cleanups run before the effects of the same commit, so a new collision
  // area is measured by the positioning below.
  useLayoutEffect(
    () => () => {
      geometry.current = null;
    },
    [boundary, padding],
  );
  useLayoutEffect(() => {
    pointer.current = { open, x, y };
    position();
    // The element exists once the scope has its portal container.
  }, [x, y, open, position, container]);

  useLayoutEffect(() => {
    const element = floating.current;
    if (!element) return;
    const view = element.ownerDocument.defaultView;
    const openedAt = view?.performance.now() ?? 0;
    const scroll = (event: Event) => {
      // Focus can queue a scroll before keyboard input opens this tooltip,
      // then deliver it afterwards. Only newer scrolling dismisses it.
      if (event.timeStamp >= openedAt) onClose();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    // New values can change the tooltip's width while it stays open.
    const resize = new ResizeObserver(remeasure);
    resize.observe(element);
    if (open) {
      view?.addEventListener("resize", remeasure);
      view?.addEventListener("scroll", scroll, true);
      view?.addEventListener("pointerdown", onClose, true);
      view?.addEventListener("keydown", escape);
    }
    return () => {
      resize.disconnect();
      view?.removeEventListener("resize", remeasure);
      view?.removeEventListener("scroll", scroll, true);
      view?.removeEventListener("pointerdown", onClose, true);
      view?.removeEventListener("keydown", escape);
    };
  }, [remeasure, onClose, open, container]);
  if (!container) return null;
  return createPortal(
    <div
      ref={attach}
      role="tooltip"
      data-state={open ? "open" : "closed"}
      aria-hidden={!open}
      className="dil-snap-tooltip z-50"
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        width: "max-content",
        visibility: "hidden",
        transform: "translate(0, -200%)",
      }}
    >
      {children}
    </div>,
    container,
  );
}
