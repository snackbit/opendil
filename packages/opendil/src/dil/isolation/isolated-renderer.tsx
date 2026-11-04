"use client";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useImperativeHandle,
  type Ref,
} from "react";
import type { DilRendererHandle } from "../renderer-handle";
import type { RendererMetrics } from "../renderer-environment";
import { useStreamFollow } from "../view/stream-follow";
import type { ProgressiveReveal } from "../view/reveal-options";
import type { AutoScroll } from "../view/scroll-options";
import type { UpdateInterval } from "../runtime/presentation-scheduler";
import { readThemeTokens, type Appearance, type ThemeTokens } from "./frame-theme";
import {
  checkFrameVersion,
  READY_AFTER_LOAD_MS,
  READY_TIMEOUT_MS,
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
  updateInterval?: UpdateInterval;
  onFollowChange?: (following: boolean) => void;
  runtimeBaseUrl?: string | undefined;
  appearance?: Appearance | undefined;
  tokens?: ThemeTokens | undefined;
  onInput?: (detail: { length: number }) => void;
  onCommit?: (detail: RendererMetrics) => void;
}
export function IsolatedRenderer({
  ref,
  text,
  isStreaming = false,
  showStatus = true,
  progressiveReveal = false,
  autoScroll = false,
  updateInterval = "instant",
  onFollowChange,
  runtimeBaseUrl = "/opendil/",
  appearance = "light",
  tokens,
  onInput,
  onCommit,
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
  const callbacks = useRef({ onInput, onCommit });
  useEffect(() => {
    callbacks.current = { onInput, onCommit };
  }, [onInput, onCommit]);
  const frame = useRef<HTMLIFrameElement>(null);
  const { pause: pauseFollow, resume } = useStreamFollow(
    frame,
    autoScroll,
    isStreaming || (streamed && !rendered),
    onFollowChange,
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
  useEffect(() => {
    const channel = new MessageChannel();
    const url = new URL(src, location.href).href;
    let initialized = false;
    const fail = () => {
      if (initialized) return;
      reportStartupFailure(url);
      setStartupFailure(startupFailureMessage(url));
    };
    let loadTimer: ReturnType<typeof setTimeout> | undefined;
    const startTimer = setTimeout(fail, READY_TIMEOUT_MS);
    const loaded = () => {
      clearTimeout(loadTimer);
      if (!initialized) loadTimer = setTimeout(fail, READY_AFTER_LOAD_MS);
    };
    const element = frame.current;
    element?.addEventListener("load", loaded);
    let gesture = 0;
    let viewportRevision = 0;
    let lastOffset = 0;
    const viewport = () => {
      const box = frame.current?.getBoundingClientRect();
      if (box) {
        lastOffset = Math.max(0, -box.top);
        channel.port1.postMessage({
          type: "viewport",
          revision: ++viewportRevision,
          offset: Math.max(0, -box.top),
          height: Math.max(
            0,
            Math.min(box.bottom, window.innerHeight) - Math.max(0, box.top),
          ),
          width: box.width,
        });
      }
    };
    const ready = (event: MessageEvent) => {
      if (
        event.source !== frame.current?.contentWindow ||
        event.origin !== "null" ||
        event.data?.type !== "dil-ready" ||
        initialized
      )
        return;
      initialized = true;
      clearTimeout(startTimer);
      clearTimeout(loadTimer);
      setStartupFailure("");
      checkFrameVersion(url, event.data.version);
      port.current = channel.port1;
      event.source?.postMessage(
        { type: "dil-init" },
        { targetOrigin: "*", transfer: [channel.port2] },
      );
      channel.port1.postMessage(themeMessage(latestTheme.current));
      channel.port1.postMessage({
        type: "source",
        suffix: latest.current.text,
        isStreaming: latest.current.isStreaming,
        showStatus: latest.current.showStatus,
        progressiveReveal: latest.current.progressiveReveal,
        updateInterval: latest.current.updateInterval,
      });
      sentLength.current = latest.current.text.length;
      viewport();
    };
    channel.port1.onmessage = (event) => {
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
        "revision" in data &&
        data.revision === viewportRevision &&
        Number.isFinite(data.offset)
      ) {
        const box = frame.current?.getBoundingClientRect();
        if (
          box &&
          Math.abs(Math.max(0, -box.top) - lastOffset) < 2 &&
          box.top < window.innerHeight &&
          box.bottom > 0
        )
          window.scrollTo(
            0,
            window.scrollY +
              box.top +
              Math.max(0, Math.min(box.height, data.offset)),
          );
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
          .then(() =>
            channel.port1.postMessage({ type: "copy-result", ok: true }),
          )
          .catch(() =>
            channel.port1.postMessage({ type: "copy-result", ok: false }),
          );
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
    window.addEventListener("message", ready);
    window.addEventListener("scroll", viewport, { passive: true });
    window.addEventListener("resize", viewport);
    const resize = new ResizeObserver(viewport);
    if (frame.current) resize.observe(frame.current);
    return () => {
      clearTimeout(startTimer);
      clearTimeout(loadTimer);
      element?.removeEventListener("load", loaded);
      window.removeEventListener("message", ready);
      window.removeEventListener("scroll", viewport);
      window.removeEventListener("resize", viewport);
      resize.disconnect();
      channel.port1.close();
      channel.port2.close();
      port.current = null;
    };
  }, [pauseFollow, src]);
  const alert =
    error ||
    (text.length > 5_000_000 ? "Message source limit exceeded" : "") ||
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
