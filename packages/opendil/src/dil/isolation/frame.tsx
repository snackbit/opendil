import { createRoot } from "react-dom/client";
import { MessageRenderer } from "../message-renderer";
import {
  OverlayRoomContext,
  UiScope,
} from "../../components/ui/overlays/ui-scope";
import { FrameOverlayRoom } from "./overlay-room";
import { readReveal } from "../view/reveal-options";
import { listenForScrollAway } from "../view/stream-follow";
import { viewportScroller } from "./viewport-scroll";
import {
  parseUpdateInterval,
  type UpdateInterval,
} from "../runtime/presentation-scheduler";
import {
  RendererEnvironmentContext,
  type RendererViewport,
  type RendererMetrics,
} from "../renderer-environment";
import { readFrameTheme, type FrameTheme } from "./frame-theme";
import { RUNTIME_VERSION } from "./frame-startup";
import type { DilRenderError } from "../render-error";
// Embedded without sandbox="allow-scripts", this page would render untrusted
// documents with the authority of the site that serves it.
if (self.origin !== "null")
  throw new Error("OpenDIL frame requires an opaque-origin sandbox");
let port: MessagePort | null = null;
let theme: FrameTheme = { appearance: "light", tokens: {} };
let message:
  | {
      source: string;
      updateInterval: UpdateInterval;
      isStreaming: boolean;
      showStatus: boolean;
      progressiveReveal: ReturnType<typeof readReveal>;
    }
  | undefined;
const element = document.getElementById("root");
if (!element) throw new Error("Missing OpenDIL frame root");
const root = createRoot(element);
const boundary = document.createElement("div");
boundary.id = "dil-visible-boundary";
boundary.style.cssText =
  "position:absolute;left:0;width:100%;pointer-events:none;visibility:hidden";
document.body.append(boundary);
document.documentElement.style.overflow = "hidden";
// The host reports which part of this frame is visible in its scroller.
const listeners = new Set<() => void>();
const viewport = {
  offset: 0,
  revision: 0,
  height: 900,
  width: 768,
  // The frame document itself does not scroll.
  origin: () => -window.scrollY,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  scrollTo: (offset: number) => scrolling.scroll(offset),
};
let resolveCopy: ((ok: boolean) => void) | undefined;
const scrolling = viewportScroller(viewport, (offset, revision) =>
  port?.postMessage({ type: "scroll", offset, revision }),
);
const environment = {
  viewport: viewport satisfies RendererViewport,
  onInput: (detail: { length: number }) =>
    port?.postMessage({ type: "input", detail }),
  onCommit: (detail: RendererMetrics) =>
    port?.postMessage({ type: "commit", detail }),
  onError: (error: DilRenderError) =>
    port?.postMessage({ type: "error", error }),
  copy: (text: string) =>
    new Promise<boolean>((resolve) => {
      resolveCopy?.(false);
      const timer = setTimeout(() => {
        if (resolveCopy === done) resolveCopy = undefined;
        resolve(false);
      }, 2000);
      const done = (ok: boolean) => {
        clearTimeout(timer);
        resolve(ok);
      };
      resolveCopy = done;
      port?.postMessage({ type: "copy", text });
    }),
};
const overlayRoom = new FrameOverlayRoom(
  () => viewport.offset + viewport.height,
  () => window.innerHeight,
);
window.addEventListener("resize", overlayRoom.update);
function render() {
  if (!message) return;
  root.render(
    <RendererEnvironmentContext.Provider value={environment}>
      <OverlayRoomContext.Provider value={overlayRoom}>
        <UiScope
          boundary={boundary}
          appearance={theme.appearance}
          tokens={theme.tokens}
        >
          <MessageRenderer
            updateInterval={message.updateInterval}
            text={message.source}
            isStreaming={message.isStreaming}
            showStatus={message.showStatus}
            progressiveReveal={message.progressiveReveal}
          />
        </UiScope>
      </OverlayRoomContext.Provider>
    </RendererEnvironmentContext.Provider>,
  );
}
window.addEventListener("message", (event: MessageEvent<unknown>) => {
  const data = event.data;
  if (
    event.source !== parent ||
    !data ||
    typeof data !== "object" ||
    !("type" in data)
  )
    return;
  // A renderer whose effect restarted while this document stayed mounted, for
  // example under React <Activity>, asks again so it can reconnect.
  if (data.type === "dil-hello") announce();
  if (data.type === "dil-init" && event.ports[0]) connect(event.ports[0]);
});
/** Adopts the renderer's port; a reconnecting renderer resends its full source. */
function connect(next: MessagePort) {
  clearInterval(readyTimer);
  port?.close();
  resolveCopy?.(false);
  resolveCopy = undefined;
  port = next;
  reportedHeight = -1;
  let source = "";
  port.onmessage = (event: MessageEvent<unknown>) => {
    const data = event.data;
    if (!data || typeof data !== "object" || !("type" in data)) return;
    if (
      data.type === "copy-result" &&
      "ok" in data &&
      typeof data.ok === "boolean"
    ) {
      resolveCopy?.(data.ok);
      resolveCopy = undefined;
    }
    if (
      data.type === "source" &&
      "suffix" in data &&
      typeof data.suffix === "string" &&
      source.length + data.suffix.length <= 5_000_000
    ) {
      if ("showStatus" in data && typeof data.showStatus !== "boolean") return;
      let updateInterval: UpdateInterval;
      try {
        updateInterval = parseUpdateInterval(
          "updateInterval" in data ? data.updateInterval : undefined,
        );
      } catch {
        return;
      }
      source += data.suffix;
      message = {
        source,
        updateInterval,
        isStreaming: "isStreaming" in data && data.isStreaming === true,
        showStatus: !("showStatus" in data) || data.showStatus === true,
        progressiveReveal: readReveal(
          "progressiveReveal" in data ? data.progressiveReveal : false,
        ),
      };
      render();
    }
    if (data.type === "theme") {
      const next = readFrameTheme(data);
      if (next) {
        theme = next;
        // Matches the host's iframe element so the browser keeps the frame transparent.
        document.documentElement.style.colorScheme = next.appearance;
        render();
      }
    }
    if (
      data.type === "viewport" &&
      "offset" in data &&
      typeof data.offset === "number" &&
      Number.isFinite(data.offset) &&
      "height" in data &&
      typeof data.height === "number" &&
      Number.isFinite(data.height) &&
      "revision" in data &&
      typeof data.revision === "number" &&
      Number.isFinite(data.revision)
    ) {
      viewport.offset = Math.max(0, Math.min(4_000_000, data.offset));
      viewport.revision = data.revision;
      viewport.height = Math.max(0, Math.min(4000, data.height));
      if (
        "width" in data &&
        typeof data.width === "number" &&
        Number.isFinite(data.width)
      )
        viewport.width = Math.max(1, Math.min(4096, data.width));
      boundary.style.top = viewport.offset + "px";
      boundary.style.height = viewport.height + "px";
      listeners.forEach((listener) => listener());
      overlayRoom.update();
    }
  };
  port.start();
  reportHeight();
}
listenForScrollAway(window, () => port?.postMessage({ type: "reading" }));
// The host sizes the frame to this height. Open popovers and tooltips are
// fixed-position portals outside the content flow, so the frame also grows to
// show them instead of clipping them in a short message. overlayRoom lets
// them open below their trigger instead of flipping above the frame's top.
let portals: Element | null = null;
let reportedHeight = -1;
const overlays = new MutationObserver(() => reportHeight());
const reportHeight = () => {
  if (!portals?.isConnected) {
    portals = element.querySelector("[data-dil-portals]");
    overlays.disconnect();
    if (portals)
      overlays.observe(portals, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["style", "data-state"],
      });
  }
  let height = element.scrollHeight;
  const placed: DOMRect[] = [];
  for (const overlay of portals?.children ?? []) {
    const box = overlay.getBoundingClientRect();
    // Radix parks an overlay above the viewport until it has been placed.
    if (
      !box.height ||
      (overlay instanceof HTMLElement &&
        overlay.style.transform === "translate(0, -200%)")
    )
      continue;
    placed.push(box);
    height = Math.max(height, Math.ceil(box.bottom) + 8);
  }
  overlayRoom.track(placed);
  if (!port || height === reportedHeight) return;
  reportedHeight = height;
  port.postMessage({ type: "height", height });
};
new ResizeObserver(reportHeight).observe(element);
for (const name of ["pointerdown", "keydown"])
  window.addEventListener(
    name,
    (event) => {
      if (event.isTrusted) port?.postMessage({ type: "gesture" });
    },
    { capture: true },
  );
// The version lets the host warn when copied runtime assets are stale. The
// instance tells a renderer whether this is the document it is connected to or
// a reloaded one.
const instance = Math.random().toString(36).slice(2);
function announce() {
  parent.postMessage(
    { type: "dil-ready", version: RUNTIME_VERSION, instance },
    "*",
  );
}
announce();
const readyTimer = setInterval(announce, 500);
