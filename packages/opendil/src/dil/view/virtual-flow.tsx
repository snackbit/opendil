"use client";
import {
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type ReactNode,
} from "react";
import {
  defaultRangeExtractor,
  useWindowVirtualizer,
  measureElement,
  type Range,
} from "@tanstack/react-virtual";
import type { ChildList } from "../runtime/child-list";
import type { DilDocument } from "../runtime/document";
import type { Scope } from "../runtime/expressions";
import { NodeView } from "./node-view";
import { TableScope, VirtualRowScope } from "./table-context";
import { useRendererEnvironment } from "../renderer-environment";
import { RenderAllowance, RenderExceeded } from "./render-limit";
import { childrenCost } from "../runtime/view-cost";
import { VirtualPresentation } from "./reveal/presentation";

export interface VirtualFlowProps {
  identity?: string;
  count: number;
  childIds?: ChildList;
  document: DilDocument;
  scope: Scope;
  instance: string;
  renderItem?: (index: number) => ReactNode;
  itemKey?: (index: number) => string | number;
}
export function VirtualFlow({
  identity,
  count,
  childIds,
  document,
  scope,
  instance,
  renderItem,
  itemKey,
}: VirtualFlowProps) {
  const enabled = count > 100;
  const painted = useRef(false),
    previousCount = useRef(0);
  useLayoutEffect(() => {
    painted.current = true;
    previousCount.current = count;
  }, [count]);
  const flowIdentity =
    identity ??
    "children:" +
      (childIds?.length ? childIds.get(0) : "empty") +
      ":" +
      instance;
  const allowance = useContext(RenderAllowance);
  const { viewport } = useRendererEnvironment();
  const group = useId();
  const container = useRef<HTMLElement | null>(null);
  const table = useContext(TableScope) === "body";
  const setContainer = useCallback((element: HTMLElement | null) => {
    container.current = element;
  }, []);
  const [margin, setMargin] = useState(0);
  const [pinned, setPinned] = useState<number | null>(null);
  const [overlay, setOverlay] = useState<number | null>(null);
  // Positions are measured from the renderer's top, so layout outside it
  // never shifts them. Content above this flow inside the renderer can.
  useLayoutEffect(() => {
    const update = () =>
      setMargin(
        (container.current?.getBoundingClientRect().top ?? 0) -
          (viewport ? viewport.origin() : -window.scrollY),
      );
    update();
    const observer = new ResizeObserver(update);
    observer.observe(window.document.body);
    window.addEventListener("resize", update);
    const unsubscribe = viewport?.subscribe(update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      unsubscribe?.();
    };
  }, [enabled, viewport]);
  const getItemKey = useCallback(
    (index: number) =>
      itemKey ? itemKey(index) : (childIds?.get(index) ?? index),
    [itemKey, childIds],
  );
  const rangeExtractor = useCallback(
    (range: Range) =>
      [
        ...new Set([
          ...defaultRangeExtractor(range),
          ...(pinned === null ? [] : [pinned]),
          ...(overlay === null ? [] : [overlay]),
        ]),
      ].sort((a, b) => a - b),
    [pinned, overlay],
  );
  // The renderer supplies its scroller's visible area: a host page, a scroll
  // container, or the part of an iframe its host reports as visible.
  const virtualizer = useWindowVirtualizer({
    ...(viewport
      ? {
          initialOffset: () => viewport.offset,
          scrollToFn: (offset, { adjustments }) =>
            viewport.scrollTo(offset + (adjustments ?? 0)),
          observeElementRect: (_instance, callback) => {
            const emit = () =>
              callback({ width: viewport.width, height: viewport.height });
            emit();
            return viewport.subscribe(emit);
          },
          observeElementOffset: (_instance, callback) => {
            let previous = viewport.offset;
            let timer: ReturnType<typeof setTimeout> | undefined;
            const emit = () => {
              const offset = viewport.offset;
              const changed = previous !== offset;
              previous = offset;
              callback(offset, changed);
              if (changed) {
                clearTimeout(timer);
                timer = setTimeout(() => callback(viewport.offset, false), 150);
              }
            };
            emit();
            const unsubscribe = viewport.subscribe(emit);
            return () => {
              clearTimeout(timer);
              unsubscribe();
            };
          },
        }
      : {}),
    count,
    enabled,
    estimateSize: () => 140,
    overscan: 5,
    scrollMargin: margin,
    getItemKey,
    rangeExtractor,
    measureElement: (element, entry, instance) => {
      // Pending guest values have no final geometry. Keep the virtual estimate until their real content commits.
      if (element.querySelector('[data-dil-pending], [aria-busy="true"]')) {
        const index = Number(
          element.getAttribute(instance.options.indexAttribute),
        );
        return (
          instance.itemSizeCache.get(instance.options.getItemKey(index)) ??
          instance.options.estimateSize(index)
        );
      }
      return measureElement(element, entry, instance);
    },
  });
  const onFocus = useCallback(
    (event: FocusEvent<HTMLElement>) => {
      const element = event.target.closest<HTMLElement>(
        `[data-virtual-group="${CSS.escape(group)}"]`,
      );
      if (element) setPinned(Number(element.dataset.virtualIndex));
    },
    [group],
  );
  const onBlur = useCallback((event: FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setPinned(null);
  }, []);
  useEffect(() => {
    const element = table
      ? container.current?.closest("tbody")
      : container.current;
    if (!element) return;
    const observer = new MutationObserver(() => {
      const anchor = element
        .querySelector<HTMLElement>('[aria-expanded="true"]')
        ?.closest<HTMLElement>(`[data-virtual-group="${CSS.escape(group)}"]`);
      setOverlay(anchor ? Number(anchor.dataset.virtualIndex) : null);
    });
    observer.observe(element, {
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-expanded"],
    });
    return () => observer.disconnect();
  }, [table, group]);
  const measureRow = useCallback(
    (element: HTMLElement | null) => virtualizer.measureElement(element),
    [virtualizer],
  );
  const virtualItems = virtualizer.getVirtualItems();
  // On activation, the virtualizer can have no measured viewport for one frame.
  // Keep active descendants mounted even during that initial empty range.
  const pinnedItems = enabled
    ? [pinned, overlay].flatMap((index) => {
        if (index === null || virtualItems.some((item) => item.index === index))
          return [];
        const item = virtualizer.measurementsCache[index];
        return item ? [item] : [];
      })
    : [];
  const activeItems = [
    ...new Map(
      [...virtualItems, ...pinnedItems].map((item) => [item.index, item]),
    ).values(),
  ].sort((a, b) => a.index - b.index);
  if (table) {
    const items = activeItems;
    const rows = items.map((item, index) => {
      const gap = Math.max(0, item.start - (items[index - 1]?.end ?? margin));
      return (
        <Fragment key={item.key}>
          {gap > 0 && (
            <tr aria-hidden="true">
              <td
                colSpan={100}
                style={{ height: gap, padding: 0, border: 0 }}
              />
            </tr>
          )}
          <VirtualRowScope.Provider
            value={{
              index: item.index,
              group,
              measure: measureRow,
              focus: onFocus,
              blur: onBlur,
            }}
          >
            <RenderAllowance.Provider
              value={Math.floor(allowance / Math.max(1, activeItems.length))}
            >
              <VirtualPresentation
                identity={flowIdentity + ":" + item.key}
                returning={
                  painted.current && item.index < previousCount.current
                }
              >
                {renderItem?.(item.index)}
              </VirtualPresentation>
            </RenderAllowance.Provider>
          </VirtualRowScope.Provider>
        </Fragment>
      );
    });
    const remaining = Math.max(
      0,
      virtualizer.getTotalSize() - ((items.at(-1)?.end ?? margin) - margin),
    );
    return (
      <>
        <tr ref={setContainer} data-virtualized="true" aria-hidden="true">
          <td colSpan={100} style={{ height: 0, padding: 0, border: 0 }} />
        </tr>
        {rows}
        {remaining > 0 && (
          <tr aria-hidden="true">
            <td
              colSpan={100}
              style={{ height: remaining, padding: 0, border: 0 }}
            />
          </tr>
        )}
      </>
    );
  }
  const visible = enabled
    ? activeItems
    : Array.from({ length: count }, (_, index) => ({
        key: getItemKey(index),
        index,
        start: 0,
      }));
  if (
    childIds &&
    childrenCost(
      document,
      visible.map((item) => childIds.get(item.index)),
      scope,
      false,
      allowance,
    ) > allowance
  )
    return <RenderExceeded document={document} />;
  return (
    <div
      ref={setContainer}
      data-virtualized={enabled ? "true" : undefined}
      className={enabled ? "relative w-full" : undefined}
      style={
        enabled
          ? { height: virtualizer.getTotalSize() }
          : { display: "contents" }
      }
      onFocusCapture={onFocus}
      onBlurCapture={onBlur}
    >
      {visible.map((item) => (
        <div
          key={item.key}
          ref={enabled ? virtualizer.measureElement : undefined}
          data-index={item.index}
          data-virtual-index={item.index}
          data-virtual-group={group}
          className={enabled ? "dil-virtual-item" : undefined}
          style={
            enabled
              ? { transform: `translateY(${item.start - margin}px)` }
              : { display: "contents" }
          }
        >
          <RenderAllowance.Provider
            value={
              enabled
                ? Math.floor(allowance / Math.max(1, activeItems.length))
                : allowance
            }
          >
            <VirtualPresentation
              identity={flowIdentity + ":" + item.key}
              returning={painted.current && item.index < previousCount.current}
            >
              {renderItem ? (
                renderItem(item.index)
              ) : childIds ? (
                <NodeView
                  id={childIds.get(item.index)}
                  document={document}
                  scope={scope}
                  instance={instance}
                />
              ) : null}
            </VirtualPresentation>
          </RenderAllowance.Provider>
        </div>
      ))}
    </div>
  );
}
