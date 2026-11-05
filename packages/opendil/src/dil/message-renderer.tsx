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
import type { DilRendererHandle } from "./renderer-handle";
import { useStore } from "zustand";
import type { ParserReply, StreamInput, TreeBatch } from "./parser/types";
import { useCustomization } from "./customization";
import { DilDocument } from "./runtime/document";
import { startInlineWorker } from "./runtime/inline-worker";
import { NodeView } from "./view/node-view";
import { RenderBoundary } from "./view/render-boundary";
import {
  RendererEnvironmentContext,
  useRendererEnvironment,
  writeClipboard,
} from "./renderer-environment";
import { useProgressiveReveal } from "./view/progressive-reveal";
import { RevealContext } from "./view/reveal/presentation";
import type { ProgressiveReveal } from "./view/reveal-options";
import { useStreamFollow } from "./view/stream-follow";
import type { AutoScroll, ScrollContainer } from "./view/scroll-options";
import { useScrollRoot } from "./view/scroll/root-tracker";
import { HostViewport } from "./view/scroll/host-viewport";
import type { UpdateInterval } from "./runtime/presentation-scheduler";

export interface MessageRendererProps {
  rendererRef?: Ref<DilRendererHandle> | undefined;
  text: string;
  isStreaming?: boolean;
  showStatus?: boolean;
  progressiveReveal?: ProgressiveReveal;
  autoScroll?: AutoScroll;
  scrollContainer?: ScrollContainer | undefined;
  updateInterval?: UpdateInterval;
  onFollowChange?: ((following: boolean) => void) | undefined;
}
function DocumentFeedback({
  document,
  showStatus,
  empty,
}: {
  document: DilDocument;
  showStatus: boolean;
  /** The source has no content, as after a request that failed before any text. */
  empty: boolean;
}) {
  const error = useStore(document.status, (state) => state.error);
  const copied = useStore(document.status, (state) => state.clipboard?.ok);
  const complete = useStore(document.status, (state) => state.complete);
  const incomplete = useStore(document.status, (state) => state.incomplete);
  const scanned = useStore(document.status, (state) => state.scanned);
  return (
    <div
      data-complete={complete}
      data-incomplete={incomplete}
      data-scanned={scanned}
    >
      {/* A finished message without content has no status worth labeling. */}
      {showStatus && !(complete && empty) && (
        <span
          role="status"
          className="mb-4 block text-xs text-muted-foreground"
        >
          {!complete
            ? "Receiving document"
            : incomplete
              ? "Incomplete"
              : "Complete"}
        </span>
      )}
      {error && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-destructive/30 p-3 text-sm text-destructive"
        >
          {error}
        </div>
      )}
      {/* The calling control shows clipboard outcomes; this region announces them. */}
      <span role="status" className="sr-only">
        {copied === undefined
          ? ""
          : copied
            ? "Copied to clipboard."
            : "Copy failed. Check clipboard permissions."}
      </span>
    </div>
  );
}
/** Marks where a document that ended early stops. */
function IncompleteNotice({ document }: { document: DilDocument }) {
  const incomplete = useStore(document.status, (state) => state.incomplete);
  if (!incomplete) return null;
  return (
    <p data-dil-incomplete className="mt-4 text-xs text-muted-foreground">
      This response ended before it was finished.
    </p>
  );
}
export function MessageRenderer({
  rendererRef,
  text,
  isStreaming = false,
  showStatus = true,
  progressiveReveal = false,
  autoScroll = false,
  scrollContainer = "auto",
  updateInterval = "instant",
  onFollowChange,
}: MessageRendererProps) {
  const [document, setDocument] = useState<DilDocument | null>(null);
  const [rendered, setRendered] = useState(!isStreaming);
  const [streamed, setStreamed] = useState(isStreaming);
  useEffect(() => {
    if (isStreaming) setStreamed(true);
  }, [isStreaming]);
  const root = useRef<HTMLDivElement>(null);
  const environment = useRendererEnvironment();
  // Inside the iframe runtime, the host reports the visible area instead.
  const framed = environment.viewport !== undefined;
  const scroller = useScrollRoot(root, scrollContainer, !framed);
  const [hostViewport] = useState(
    () => new HostViewport(() => root.current, scroller),
  );
  const viewport = environment.viewport ?? hostViewport;
  const scoped = useMemo(
    () => ({ ...environment, viewport }),
    [environment, viewport],
  );
  const presentation = useProgressiveReveal(
    root,
    progressiveReveal,
    document,
    viewport,
  );
  const { resume } = useStreamFollow(
    root,
    autoScroll,
    isStreaming || (streamed && !rendered),
    onFollowChange,
    scroller,
  );
  useImperativeHandle(rendererRef, () => ({ resumeAutoScroll: resume }), [
    resume,
  ]);
  const worker = useRef<Worker | null>(null);
  const previousLength = useRef(0);
  const finalized = useRef(false);
  // Lowercase custom tags are DIL components only when the parser knows their names.
  const { components } = useCustomization();
  const componentNames = useMemo(
    () => Object.keys(components ?? {}).join("\n"),
    [components],
  );
  const sentNames = useRef("");
  const environmentRef = useRef(environment);
  useEffect(() => {
    environmentRef.current = environment;
  }, [environment]);
  useEffect(() => {
    const document = new DilDocument();
    document.onError = (error) => environmentRef.current.onError?.(error);
    previousLength.current = 0;
    finalized.current = false;
    sentNames.current = "";
    let frame = 0;
    let queued: TreeBatch[] = [];
    let latest = { revision: 0, scanned: 0 };
    const publish = () => {
      frame = 0;
      const batches = queued;
      queued = [];
      const last = batches.at(-1);
      if (!last) return;
      const nodes = new Map(
        batches.flatMap((batch) =>
          batch.nodes.map((node) => [node.id, node] as const),
        ),
      );
      document.apply({
        ...last,
        nodes: [...nodes.values()],
        links: batches.flatMap((batch) => batch.links),
        declarations: batches.flatMap((batch) => batch.declarations),
        issues: batches.flatMap((batch) => batch.issues),
      });
      // The final batch is committed and finalized text cannot change, so the
      // parser has no further work; free its worker instead of keeping it per message.
      if (last.complete) {
        parser.dispose();
        worker.current = null;
      }
      setRendered(last.complete);
      environmentRef.current.onCommit?.({
        scanned: last.scanned,
        complete: last.complete,
        incomplete: document.status.getState().incomplete,
      });
    };
    const copy = (event: Event) => {
      const detail: unknown =
        event instanceof CustomEvent ? event.detail : null;
      if (
        !detail ||
        typeof detail !== "object" ||
        !("text" in detail) ||
        typeof detail.text !== "string" ||
        detail.text.length > 65536 ||
        !("intent" in detail) ||
        typeof detail.intent !== "number"
      )
        return;
      const text = detail.text;
      const intent = detail.intent;
      const action = environmentRef.current.copy;
      const report = (ok: boolean) =>
        document.status.setState({ clipboard: { intent, ok } });
      // Every request ends in a visible outcome, even when a host copy hook throws.
      let result: Promise<boolean>;
      try {
        result = action ? action(text) : writeClipboard(text);
      } catch {
        result = Promise.resolve(false);
      }
      void result.then(report, () => report(false));
    };
    document.engine.events.addEventListener("dil:copy", copy);
    const parser = startInlineWorker(__DIL_PARSER_WORKER__, {
      role: "document parser",
      crashMessage:
        "The document parser stopped. Remount the renderer to try again.",
      onMessage: (reply: ParserReply) => {
        let batch: TreeBatch;
        if ("stopped" in reply) {
          document.fail({ kind: "limit", message: reply.message });
          // Nothing more is parsed, so the document is final as it stands.
          batch = {
            ...latest,
            revision: latest.revision + 1,
            nodes: [],
            links: [],
            declarations: [],
            issues: [],
            complete: true,
          };
        } else batch = reply;
        latest = { revision: batch.revision, scanned: batch.scanned };
        queued.push(batch);
        if (!frame)
          frame = requestAnimationFrame(() => {
            frame = 0;
            document.updates.enqueue("source", publish);
          });
      },
      onStop: (message) => document.fail({ kind: "runtime", message }),
    });
    worker.current = parser.worker;
    setDocument(document);
    return () => {
      parser.dispose();
      document.engine.events.removeEventListener("dil:copy", copy);
      document.engine.dispose();
      worker.current = null;
      cancelAnimationFrame(frame);
    };
  }, []);
  useEffect(() => {
    document?.updates.configure(updateInterval);
  }, [document, updateInterval]);
  useEffect(() => {
    if (!document) return;
    if (text.length > 5_000_000) {
      document.fail({
        kind: "limit",
        message: "Message source limit exceeded",
      });
      return;
    }
    if (
      text.length < previousLength.current ||
      (finalized.current && text.length !== previousLength.current)
    ) {
      document.fail({
        kind: "source",
        message:
          "Start a new renderer instance before replacing or restarting the document.",
      });
      return;
    }
    const suffix = text.slice(previousLength.current);
    if (suffix || (!isStreaming && !finalized.current)) {
      environmentRef.current.onInput?.({ length: text.length });
      const input: StreamInput = { suffix, complete: !isStreaming };
      if (componentNames !== sentNames.current) {
        input.components = componentNames.split("\n");
        sentNames.current = componentNames;
      }
      worker.current?.postMessage(input);
    }
    previousLength.current = text.length;
    // Final text stays final: the parser stops after it, so streaming again
    // with more text is a restart error rather than a silently dropped suffix.
    if (!isStreaming) finalized.current = true;
  }, [text, isStreaming, document, componentNames]);
  // Clipboard writes need a trusted activation of a document action, not typing or pointer input.
  const gesture = useCallback(
    (event: React.MouseEvent) => {
      if (
        event.isTrusted &&
        event.target instanceof Element &&
        event.target.closest("[data-dil-action]")
      )
        document?.engine.markGesture();
    },
    [document],
  );
  return (
    <div
      className="dil-document"
      ref={root}
      data-dil-renderer="true"
      onClickCapture={gesture}
    >
      {document && (
        <RendererEnvironmentContext.Provider value={scoped}>
          <DocumentFeedback
            document={document}
            showStatus={showStatus}
            empty={!/\S/.test(text)}
          />
          <RevealContext.Provider value={presentation}>
            <RenderBoundary
              revision="document"
              streaming={isStreaming}
              onError={(message) =>
                document.report({ kind: "runtime", message })
              }
            >
              <div className="dil-flow" data-dil-content>
                <NodeView id={0} document={document} />
              </div>
            </RenderBoundary>
          </RevealContext.Provider>
          <IncompleteNotice document={document} />
        </RendererEnvironmentContext.Provider>
      )}
    </div>
  );
}
