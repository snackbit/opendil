"use client";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useImperativeHandle,
  type Ref,
} from "react";
import type { DilRendererHandle } from "../renderer-handle";
import type { RendererMetrics } from "../renderer-environment";
import {
  deliverError,
  ProblemReports,
  readRenderError,
  type DilRenderError,
} from "../render-error";
import { useStreamFollow } from "../view/stream-follow";
import type { ProgressiveReveal } from "../view/reveal-options";
import type { AutoScroll, ScrollContainer } from "../view/scroll-options";
import { useScrollRoot } from "../view/scroll/root-tracker";
import { FrameViewportReporter } from "./frame-viewport";
import type { UpdateInterval } from "../runtime/presentation-scheduler";
import {
  readThemeTokens,
  type Appearance,
  type ThemeTokens,
} from "./frame-theme";
import {
  checkFrameVersion,
  READY_AFTER_LOAD_MS,
  SILENT_FRAME_MS,
  reportRejectedTokens,
  reportStartupFailure,
  startupFailureMessage,
} from "./frame-startup";
export interface IsolatedRendererProps {
  ref?: Ref<DilRendererHandle> | undefined;
  text: string;
  isStreaming?: boolean;
  showStatus?: boolean;
  progressiveReveal?: ProgressiveReveal;
  autoScroll?: AutoScroll;
  scrollContainer?: ScrollContainer | undefined;
  updateInterval?: UpdateInterval;
  onFollowChange?: (following: boolean) => void;
  runtimeBaseUrl?: string | undefined;
  appearance?: Appearance | undefined;
  tokens?: ThemeTokens | undefined;
  onInput?: (detail: { length: number }) => void;
  onCommit?: (detail: RendererMetrics) => void;
  onError?: ((error: DilRenderError) => void) | undefined;
}
export function IsolatedRenderer({
  ref,
  text,
  isStreaming = false,
  showStatus = true,
  progressiveReveal = false,
  autoScroll = false,
  scrollContainer = "auto",
  updateInterval = "instant",
  onFollowChange,
  runtimeBaseUrl = "/opendil/",
  appearance = "light",
  tokens,
  onInput,
  onCommit,
  onError,
}: IsolatedRendererProps) {
  const src = runtimeBaseUrl.replace(/\/$/, "") + "/frame.html";
  // Callers usually pass a new tokens object on every render; compare contents.
  const tokenKey = JSON.stringify(tokens ?? {});
  const theme = useMemo(() => {
    const { tokens: valid, rejected } = readThemeTokens(JSON.parse(tokenKey));
    return { appearance, tokens: valid, rejected };
  }, [appearance, tokenKey]);
  useEffect(() => reportRejectedTokens(theme.rejected), [theme]);
  const [rendered, setRendered] = useState(!isStreaming);
  const [streamed, setStreamed] = useState(isStreaming);
  useEffect(() => {
    if (isStreaming) setStreamed(true);
  }, [isStreaming]);
  const callbacks = useRef({ onInput, onCommit, onError });
  useEffect(() => {
    callbacks.current = { onInput, onCommit, onError };
  }, [onInput, onCommit, onError]);
  // The frame bounds its reports too; this budget holds even if it does not.
  const reports = useRef<ProblemReports>(null);
  const report = useCallback((problem: DilRenderError) => {
    reports.current ??= new ProblemReports();
    const error = reports.current.take(problem);
    if (error) deliverError(callbacks.current.onError, error);
  }, []);
  const frame = useRef<HTMLIFrameElement>(null);
  const scroller = useScrollRoot(frame, scrollContainer);
  const { pause: pauseFollow, resume } = useStreamFollow(
    frame,
    autoScroll,
    isStreaming || (streamed && !rendered),
    onFollowChange,
    scroller,
  );
  useImperativeHandle(ref, () => ({ resumeAutoScroll: resume }), [resume]);
  const port = useRef<MessagePort | null>(null);
  const latest = useRef({
    text,
    isStreaming,
    showStatus,
    progressiveReveal,
    updateInterval,
  });
  const latestTheme = useRef(theme);
  const sentLength = useRef(0);
  // Sized to the reported content height; nothing is reserved before it arrives.
  const [height, setHeight] = useState(0);
  const [error, setError] = useState("");
  const [startupFailure, setStartupFailure] = useState("");
  useEffect(() => {
    latestTheme.current = theme;
    port.current?.postMessage(themeMessage(theme));
  }, [theme]);
  useEffect(() => {
    latest.current = {
      text,
      isStreaming,
      showStatus,
      progressiveReveal,
      updateInterval,
    };
    if (text.length > 5_000_000) return;
    if (port.current && text.length < sentLength.current) {
      queueMicrotask(() =>
        setError("Start a new message instance before replacing its source."),
      );
      return;
    }
    if (port.current && text.length >= sentLength.current) {
      port.current.postMessage({
        type: "source",
        suffix: text.slice(sentLength.current),
        isStreaming,
        showStatus,
        progressiveReveal,
        updateInterval,
      });
      sentLength.current = text.length;
    }
  }, [text, isStreaming, showStatus, progressiveReveal, updateInterval]);
  // The src whose frame document has announced itself. When the effect runs
  // again for the same mounted document (React <Activity>, back/forward
  // navigation), the renderer reconnects instead of re-proving the frame.
  const announcedSrc = useRef("");
  useEffect(() => {
    const url = new URL(src, location.href).href;
    let channel: MessageChannel | undefined;
    let connectedInstance: unknown;
    const fail = () => {
      if (channel) return;
      reportStartupFailure(url);
      setStartupFailure(startupFailureMessage(url));
    };
    let loadTimer: ReturnType<typeof setTimeout> | undefined;
    const silentTimer =
      announcedSrc.current === src
        ? undefined
        : setTimeout(fail, SILENT_FRAME_MS);
    const clearTimers = () => {
      clearTimeout(silentTimer);
      clearTimeout(loadTimer);
    };
    const loaded = () => {
      clearTimeout(loadTimer);
      if (!channel) loadTimer = setTimeout(fail, READY_AFTER_LOAD_MS);
    };
    const element = frame.current;
    element?.addEventListener("load", loaded);
    // A frame document that announced itself to an earlier run answers this.
    element?.contentWindow?.postMessage({ type: "dil-hello" }, "*");
    let gesture = 0;
    const viewport = element
      ? new FrameViewportReporter(element, scroller, (message) =>
          channel?.port1.postMessage(message),
        )
      : undefined;
    // Each connection gets a fresh channel and the full source, so a frame can
    // be reconnected after this effect restarts or after its document reloads.
    const connect = (target: MessageEventSource, instance: unknown) => {
      channel?.port1.close();
      const next = new MessageChannel();
      channel = next;
      connectedInstance = instance;
      announcedSrc.current = src;
      clearTimers();
      setStartupFailure("");
      next.port1.onmessage = (event) => receive(next.port1, event);
      port.current = next.port1;
      target.postMessage(
        { type: "dil-init" },
        { targetOrigin: "*", transfer: [next.port2] },
      );
      next.port1.postMessage(themeMessage(latestTheme.current));
      next.port1.postMessage({
        type: "source",
        suffix: latest.current.text,
        isStreaming: latest.current.isStreaming,
        showStatus: latest.current.showStatus,
        progressiveReveal: latest.current.progressiveReveal,
        updateInterval: latest.current.updateInterval,
      });
      sentLength.current = latest.current.text.length;
      viewport?.report();
    };
    const fromFrame = (event: MessageEvent) => {
      if (
        !event.source ||
        event.source !== frame.current?.contentWindow ||
        event.origin !== "null"
      )
        return;
      const data: unknown = event.data;
      if (!data || typeof data !== "object" || !("type" in data)) return;
      // frame.html pings while frame.js downloads, so a slow frame is not missing.
      if (data.type === "dil-loading") clearTimeout(silentTimer);
      if (data.type === "dil-failed") {
        clearTimers();
        fail();
      }
      // Repeated announcements from the connected document are ignored; a new
      // instance means the frame document was reloaded.
      const instance = "instance" in data ? data.instance : undefined;
      if (
        data.type === "dil-ready" &&
        (!channel || instance !== connectedInstance)
      ) {
        checkFrameVersion(url, "version" in data ? data.version : undefined);
        connect(event.source, instance);
      }
    };
    const receive = (reply: MessagePort, event: MessageEvent) => {
      const data: unknown = event.data;
      if (!data || typeof data !== "object" || !("type" in data)) return;
      if (
        data.type === "height" &&
        "height" in data &&
        typeof data.height === "number" &&
        Number.isFinite(data.height)
      ) {
        setHeight(Math.max(0, Math.min(4_000_000, Math.ceil(data.height))));
      }
      if (
        data.type === "scroll" &&
        "offset" in data &&
        typeof data.offset === "number" &&
        Number.isFinite(data.offset) &&
        "revision" in data &&
        typeof data.revision === "number"
      )
        viewport?.scroll(data.offset, data.revision);
      if (data.type === "error" && "error" in data) {
        const error = readRenderError(data.error);
        if (error) report(error);
      }
      if (data.type === "gesture") gesture = performance.now() + 750;
      if (data.type === "reading") pauseFollow();
      if (
        data.type === "copy" &&
        "text" in data &&
        typeof data.text === "string" &&
        data.text.length <= 65536 &&
        navigator.userActivation.isActive &&
        performance.now() < gesture
      ) {
        gesture = 0;
        void navigator.clipboard
          .writeText(data.text)
          .then(() => reply.postMessage({ type: "copy-result", ok: true }))
          .catch(() => reply.postMessage({ type: "copy-result", ok: false }));
      }
      if ("detail" in data && data.detail && typeof data.detail === "object") {
        const detail = data.detail;
        if (
          data.type === "commit" &&
          "scanned" in detail &&
          typeof detail.scanned === "number" &&
          Number.isFinite(detail.scanned) &&
          "complete" in detail &&
          typeof detail.complete === "boolean"
        ) {
          setRendered(detail.complete);
          callbacks.current.onCommit?.({
            scanned: detail.scanned,
            complete: detail.complete,
            // Frames copied from earlier releases do not send it.
            incomplete: "incomplete" in detail && detail.incomplete === true,
          });
        }
        if (
          data.type === "input" &&
          "length" in detail &&
          typeof detail.length === "number" &&
          Number.isFinite(detail.length)
        )
          callbacks.current.onInput?.({ length: detail.length });
      }
    };
    window.addEventListener("message", fromFrame);
    return () => {
      clearTimers();
      element?.removeEventListener("load", loaded);
      window.removeEventListener("message", fromFrame);
      viewport?.dispose();
      channel?.port1.close();
      port.current = null;
    };
  }, [pauseFollow, report, src, scroller]);
  const oversized = text.length > 5_000_000;
  // Errors found outside the frame reach onError once each, like the frame's own.
  useEffect(() => {
    if (error) report({ kind: "source", message: error });
  }, [error, report]);
  useEffect(() => {
    if (oversized)
      report({ kind: "limit", message: "Message source limit exceeded" });
  }, [oversized, report]);
  useEffect(() => {
    if (startupFailure) report({ kind: "runtime", message: startupFailure });
  }, [startupFailure, report]);
  const alert =
    error ||
    (oversized ? "Message source limit exceeded" : "") ||
    startupFailure;
  return (
    <section
      data-dil-message
      className="dil-scope"
      data-theme={theme.appearance}
      style={theme.tokens}
    >
      {alert && <p role="alert">{alert}</p>}
      <iframe
        ref={frame}
        title="DIL message"
        src={src}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        style={{
          width: "100%",
          height,
          border: 0,
          // Matching the frame's color scheme keeps the browser from painting an
          // opaque backdrop, so a transparent --background shows the host page.
          colorScheme: theme.appearance,
          display: startupFailure ? "none" : "block",
        }}
      />
    </section>
  );
}
function themeMessage(theme: { appearance: Appearance; tokens: ThemeTokens }) {
  return { type: "theme", appearance: theme.appearance, tokens: theme.tokens };
}
