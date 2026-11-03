import { createRoot } from "react-dom/client";
import { MessageRenderer } from "../message-renderer";
import { UiScope } from "../../components/ui/overlays/ui-scope";
import { readReveal } from "../view/reveal-options";
import { listenForScrollAway } from "../view/stream-follow";
import { viewportScroller } from "./viewport-scroll";
import {
  parseUpdateInterval,
  type UpdateInterval,
} from "../runtime/presentation-scheduler";
import {
  RendererEnvironmentContext,
  type FrameViewport,
} from "../renderer-environment";
// Embedded without sandbox="allow-scripts", this page would render untrusted
// documents with the authority of the site that serves it.
if (self.origin !== "null")
  throw new Error("OpenDIL frame requires an opaque-origin sandbox");
let port: MessagePort | null = null;
const element = document.getElementById("root");
if (!element) throw new Error("Missing OpenDIL frame root");
const root = createRoot(element);
const boundary = document.createElement("div");
boundary.id = "dil-visible-boundary";
boundary.style.cssText =
  "position:absolute;left:0;width:100%;pointer-events:none;visibility:hidden";
document.body.append(boundary);
document.documentElement.style.overflow = "hidden";
const viewport: FrameViewport = {
  offset: 0,
  revision: 0,
  height: 900,
  width: 768,
  listeners: new Set(),
};
let resolveCopy: ((ok: boolean) => void) | undefined;
const scrolling = viewportScroller(viewport, (offset, revision) =>
  port?.postMessage({ type: "scroll", offset, revision }),
);
const environment = {
  viewport,
  scrollTo: scrolling.scroll,
  onInput: (detail: { length: number }) =>
    port?.postMessage({ type: "input", detail }),
  onCommit: (detail: { scanned: number; complete: boolean }) =>
    port?.postMessage({ type: "commit", detail }),
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
window.addEventListener("message", (event: MessageEvent<unknown>) => {
  const data = event.data;
  if (
    port ||
    event.source !== parent ||
    !data ||
    typeof data !== "object" ||
    !("type" in data) ||
    data.type !== "dil-init" ||
    !event.ports[0]
  )
    return;
  clearInterval(readyTimer);
  port = event.ports[0];
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
      root.render(
        <RendererEnvironmentContext.Provider value={environment}>
          <UiScope boundary={boundary}>
            <MessageRenderer
              updateInterval={updateInterval}
              text={source}
              isStreaming={"isStreaming" in data && data.isStreaming === true}
              showStatus={!("showStatus" in data) || data.showStatus === true}
              progressiveReveal={readReveal(
                "progressiveReveal" in data ? data.progressiveReveal : false,
              )}
            />
          </UiScope>
        </RendererEnvironmentContext.Provider>,
      );
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
      viewport.listeners.forEach((listener) => listener());
    }
  };
  port.start();
});
listenForScrollAway(window, () => port?.postMessage({ type: "reading" }));
new ResizeObserver(() =>
  port?.postMessage({ type: "height", height: element.scrollHeight }),
).observe(element);
for (const name of ["pointerdown", "keydown"])
  window.addEventListener(
    name,
    (event) => {
      if (event.isTrusted) port?.postMessage({ type: "gesture" });
    },
    { capture: true },
  );
parent.postMessage({ type: "dil-ready" }, "*");
const readyTimer = setInterval(
  () => parent.postMessage({ type: "dil-ready" }, "*"),
  500,
);
