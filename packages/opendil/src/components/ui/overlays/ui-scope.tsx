"use client";
import {
  createContext,
  createElement,
  useContext,
  useState,
  useMemo,
  useSyncExternalStore,
  type ComponentProps,
} from "react";
import { cn } from "../../../lib/cn";
const PortalScope = createContext<{
  container: HTMLElement | null;
  boundary?: Element;
}>({ container: null });
export function usePortalScope() {
  return useContext(PortalScope);
}
/**
 * Space below the viewport that overlays may extend into, in pixels. The
 * iframe runtime provides it: the host grows a content-sized frame to show an
 * overlay that extends past its bottom, so an overlay need not flip above its
 * trigger, where the frame's top would clip it.
 */
export interface OverlayRoom {
  below(): number;
  subscribe(listener: () => void): () => void;
}
export const OverlayRoomContext = createContext<OverlayRoom | null>(null);
type Side = "top" | "right" | "bottom" | "left";
export type CollisionPadding = number | Partial<Record<Side, number>>;
const noRoom = () => 0;
const unsubscribed = () => () => {};
/** Extends an overlay's collision padding by the room below the viewport. */
export function useCollisionPadding(
  padding: CollisionPadding = 0,
): CollisionPadding {
  const room = useContext(OverlayRoomContext);
  const below = useSyncExternalStore(
    room?.subscribe ?? unsubscribed,
    room?.below ?? noRoom,
    noRoom,
  );
  if (!below) return padding;
  const sides =
    typeof padding === "number"
      ? { top: padding, right: padding, bottom: padding, left: padding }
      : padding;
  // Negative padding moves the collision edge below the viewport.
  return { ...sides, bottom: (sides.bottom ?? 0) - below };
}
export interface UiScopeProps extends ComponentProps<"section"> {
  appearance?: "light" | "dark";
  /** `"inherit"` takes colors, radius, and font from the host page. */
  theme?: "stock" | "inherit";
  tokens?: Readonly<Record<`--${string}`, string>>;
  boundary?: Element;
  /** Renders spans, so the scope can sit inside phrasing content. */
  inline?: boolean;
}
export function UiScope({
  children,
  className,
  style,
  appearance = "light",
  theme = "stock",
  tokens,
  boundary,
  inline = false,
  ...props
}: UiScopeProps) {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const portal = useMemo(
    () => ({ container, ...(boundary ? { boundary } : {}) }),
    [container, boundary],
  );
  return createElement(
    inline ? "span" : "section",
    {
      ...props,
      className: cn("dil-scope", className),
      "data-theme": appearance,
      "data-dil-theme": theme,
      style: { ...style, ...tokens },
    },
    <PortalScope.Provider value={portal}>
      {children}
      {createElement(inline ? "span" : "div", {
        "data-dil-portals": "",
        ref: setContainer,
      })}
    </PortalScope.Provider>,
  );
}
