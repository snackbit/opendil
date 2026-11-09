"use client";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
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
import type { ParsedDocument, StreamParser } from "./runtime/complete-document";
import { startInlineWorker } from "./runtime/inline-worker";
import { PARSER_WORKER_ROLE } from "./runtime/inline-worker-hook";
import { NodeView } from "./view/node-view";
import { serializeRenderedDocument } from "./serialize/serialize-document";
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
import { useSettledSignal } from "./document-settled";
import {
  openDocument,
  releaseDocument,
  retainDocument,
  storeDocument,
  takeSnapshot,
  type DilSnapshot,
} from "./document-cache";

const EMPTY_COPY = { html: "", markdown: "" };
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
  /**
   * The host's identity for a finished answer. A renderer that mounts with
   * the key and text of one that unmounted adopts its live document: no
   * worker job, no placeholder, the final layout in the first commit.
   */
  cacheKey?: string | undefined;
  /** Results recorded by onSnapshot, shown until the worker confirms them. */
  snapshot?: DilSnapshot | undefined;
  /** Receives the snapshot once, when a finished answer first settles. */
  onSnapshot?: ((snapshot: DilSnapshot) => void) | undefined;
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
  const Problem = useCustomization().diagnostics?.Problem;
  const copied = useStore(document.status, (state) => state.clipboard?.ok);
  const actions = useStore(document.status, (state) => state.actions);
  const complete = useStore(document.status, (state) => state.complete);
  const incomplete = useStore(document.status, (state) => state.incomplete);
  const scanned = useStore(document.status, (state) => state.scanned);
  return (
    <div
      data-dil-copy="skip"
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
      {error &&
        (Problem ? (
          <Problem scope="document" error={error} />
        ) : (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-destructive/30 p-3 text-sm text-destructive"
          >
            {error.message}
          </div>
        ))}
      {/* The calling control shows clipboard outcomes; this region announces
          them. Custom components can copy too, so an outcome also shows it. */}
      {(actions > 0 || copied !== undefined) && (
        <span role="status" className="sr-only" data-dil-clipboard-status="">
          {copied === undefined
            ? ""
            : copied
              ? "Copied to clipboard."
              : "Copy failed. Check clipboard permissions."}
        </span>
      )}
    </div>
  );
}
/** Marks where a document that ended early stops. */
function IncompleteNotice({ document }: { document: DilDocument }) {
  const ending = useStore(document.status, (state) => state.ending);
  const Problem = useCustomization().diagnostics?.Problem;
  if (!ending) return null;
  if (Problem) return <Problem scope="document" error={ending} />;
  return (
    <p
      data-dil-incomplete
      data-dil-copy="skip"
      className="mt-4 text-xs text-muted-foreground"
    >
      This response ended before it was finished.
    </p>
  );
}
/**
 * An empty answer that is not streaming has not started, as a message a host
 * creates before its first token. When it starts, it mounts as a new
 * document: text that streams in after that point can reveal, and text that
 * arrives finished is not a restart.
 */
export function MessageRenderer(props: MessageRendererProps) {
  const started = props.isStreaming === true || props.text !== "";
  const [generation, setGeneration] = useState(started ? 1 : 0);
  if (started && generation === 0) setGeneration(1);
  return <MessageDocument key={generation} {...props} />;
}
function MessageDocument({
  rendererRef,
  text,
  isStreaming = false,
  showStatus = true,
  progressiveReveal = false,
  autoScroll = false,
  scrollContainer = "auto",
  updateInterval = "instant",
  onFollowChange,
  cacheKey,
  snapshot,
  onSnapshot,
}: MessageRendererProps) {
  // Lowercase custom tags are DIL components only when the parser knows their names.
  const { components, diagnostics } = useCustomization();
  const componentNames = useMemo(
    () => Object.keys(components ?? {}).join("\n"),
    [components],
  );
  // Text the renderer has at mount renders in the first commit, without the
  // parser worker, so there is no empty first render. The document can still
  // grow after it: expression results, lazy widgets and data arrive later.
  const [initial] = useState(() =>
    openDocument(text, isStreaming, componentNames, cacheKey, snapshot),
  );
  const mount = useRef({ cacheKey, snapshot });
  const [document, setDocument] = useState<DilDocument | null>(
    initial?.document ?? null,
  );
  // The first mount effect adopts it; undefined afterwards.
  const adoptable = useRef<ParsedDocument | null | undefined>(initial);
  // A complete document whose effect was just cleaned up. React replays
  // effects at once under StrictMode and <Activity>; the replay adopts it
  // again, with its runtime and results, instead of starting over.
  const retiring = useRef<{
    parsed: ParsedDocument;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);
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
  const environmentRef = useRef(environment);
  const snapshotRef = useRef(onSnapshot);
  // The snapshot keeps the first evaluation. Widgets that were out of view at
  // settle add their heights once they lay out, in a second report; the
  // document keeps its first snapshot, so a renderer that adopts it later
  // reports for the same text.
  const [settleReports] = useState(() => ({
    settled: () => {
      const current = documentRef.current;
      environmentRef.current.onSettled?.();
      if (!snapshotRef.current || !current || current.snapshot) return;
      current.snapshot = takeSnapshot(current, previousText.current);
      snapshotRef.current(current.snapshot);
    },
    widgetsLaidOut: () => {
      const current = documentRef.current;
      if (!snapshotRef.current || !current?.snapshot) return;
      const heights = current.heights.toJSON();
      snapshotRef.current({ ...current.snapshot, heights });
    },
  }));
  // History: a document finished at mount moves the page once, at settle.
  // One adopted from the cache has its final layout in the first commit,
  // apart from a diagram laying out again in its measured space.
  const [holdLayout] = useState(
    () => !isStreaming && !initial?.document.settledOnce,
  );
  useSettledSignal(root, document, settleReports, holdLayout, viewport);
  useLayoutEffect(() => {
    if (!document) return;
    document.presented = true;
    // A renderer that adopts it from the cache commits it anew.
    return () => {
      document.presented = false;
    };
  }, [document]);
  // Text present at mount is history, even while the answer still streams.
  const [revealFrom] = useState(() => (isStreaming ? text.length : Infinity));
  const presentation = useProgressiveReveal(
    root,
    progressiveReveal,
    document,
    viewport,
    isStreaming,
    revealFrom,
  );
  const { resume } = useStreamFollow(
    root,
    autoScroll,
    isStreaming || (streamed && !rendered),
    onFollowChange,
    scroller,
  );
  useImperativeHandle(
    rendererRef,
    () => ({
      resumeAutoScroll: resume,
      serialize: () =>
        root.current ? serializeRenderedDocument(root.current) : EMPTY_COPY,
    }),
    [resume],
  );
  const worker = useRef<StreamParser | Worker | null>(null);
  const documentRef = useRef<DilDocument | null>(null);
  const previousText = useRef("");
  const finalized = useRef(false);
  const logging = diagnostics?.console ?? true;
  const loggingRef = useRef(logging);
  const sentNames = useRef("");
  const componentNamesRef = useRef(componentNames);
  const inputRef = useRef({ text, isStreaming, cacheKey });
  useEffect(() => {
    environmentRef.current = environment;
    snapshotRef.current = onSnapshot;
    loggingRef.current = logging;
    componentNamesRef.current = componentNames;
    inputRef.current = { text, isStreaming, cacheKey };
  }, [
    environment,
    onSnapshot,
    logging,
    componentNames,
    text,
    isStreaming,
    cacheKey,
  ]);
  useEffect(() => {
    // A remount, as under StrictMode, parses complete text again rather than
    // showing an empty document until the worker answers.
    const input = inputRef.current;
    const reused = retiring.current;
    retiring.current = null;
    if (reused) clearTimeout(reused.timer);
    // The key the renderer mounted with, or the one a streamed answer got
    // when it finished, for an effect that React replays after that.
    const key = mount.current.cacheKey ?? input.cacheKey;
    const recorded = mount.current.snapshot;
    let adopted =
      reused?.parsed ??
      (adoptable.current !== undefined
        ? adoptable.current
        : openDocument(
            input.text,
            input.isStreaming,
            componentNamesRef.current,
            key,
            recorded,
          ));
    adoptable.current = undefined;
    if (key !== undefined && adopted)
      adopted = retainDocument(key, adopted, componentNamesRef.current);
    const document = adopted?.document ?? new DilDocument();
    if (key !== undefined && !adopted)
      retainDocument(
        key,
        { document, text: "", scanned: 0 },
        componentNamesRef.current,
      );
    documentRef.current = document;
    document.onError = (error) => environmentRef.current.onError?.(error);
    document.console = loggingRef.current;
    previousText.current = adopted?.text ?? "";
    finalized.current = adopted !== null && !adopted.stream;
    sentNames.current = adopted ? componentNamesRef.current : "";
    let queued: TreeBatch[] = [];
    let latest = { revision: 0, scanned: 0 };
    const publish = () => {
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
        parser?.dispose();
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
    if (adopted) {
      // Parsed in the first render; the host hears about it now.
      document.release();
      environmentRef.current.onInput?.({ length: adopted.text.length });
      // A stream that mounted empty has shown nothing yet.
      if (adopted.text || !adopted.stream) {
        environmentRef.current.onCommit?.({
          scanned: adopted.scanned,
          complete: !adopted.stream,
          incomplete: document.status.getState().incomplete,
        });
        // The first render was a publication; updateInterval counts from it.
        document.updates.published();
      }
    }
    latest = {
      revision: document.status.getState().revision,
      scanned: adopted?.scanned ?? 0,
    };
    const receive = (reply: ParserReply) => {
      let batch: TreeBatch;
      if ("stopped" in reply) {
        document.fail({
          kind: "limit",
          code: "parser-node-limit",
          message: reply.message,
        });
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
      // Publishes with the frame's evaluation results, in one commit.
      document.updates.enqueue("source", publish);
    };
    if (adopted?.stream) adopted.stream.onmessage = receive;
    const parser = adopted
      ? null
      : startInlineWorker(__DIL_PARSER_WORKER__, {
          role: PARSER_WORKER_ROLE,
          crashMessage:
            "The document parser stopped. Remount the renderer to try again.",
          crashCode: "parser-crashed",
          onMessage: receive,
          onStop: (message, code) =>
            document.fail({ kind: "runtime", code, message }),
        });
    worker.current = adopted?.stream ?? parser?.worker ?? null;
    setDocument(document);
    return () => {
      document.engine.events.removeEventListener("dil:copy", copy);
      worker.current = null;
      // A parser that has not delivered the final batch has no further use:
      // the cache keeps only finished documents.
      parser?.dispose();
      const dispose = () => {
        document.engine.dispose();
        document.updates.cancel("source");
      };
      const complete = finalized.current && document.status.getState().complete;
      // The cache keeps a finished document for the next renderer with its key.
      if (
        key !== undefined &&
        releaseDocument(key, document, previousText.current, complete)
      )
        return;
      const late = inputRef.current.cacheKey;
      if (
        key === undefined &&
        late !== undefined &&
        complete &&
        !document.engine.stopped &&
        storeDocument(
          late,
          document,
          previousText.current,
          componentNamesRef.current,
        )
      )
        return;
      if (adopted && !adopted.stream)
        retiring.current = {
          parsed: { ...adopted, text: previousText.current },
          timer: setTimeout(() => {
            retiring.current = null;
            dispose();
          }, 0),
        };
      else dispose();
    };
  }, []);
  useEffect(() => {
    document?.updates.configure(updateInterval);
  }, [document, updateInterval]);
  useEffect(() => {
    if (document) document.console = logging;
  }, [document, logging]);
  useEffect(() => {
    if (!document) return;
    if (text.length > 5_000_000) {
      document.fail({
        kind: "limit",
        code: "source-limit",
        message: "Message source limit exceeded",
      });
      return;
    }
    const previous = previousText.current;
    // Only appending is supported: anything else would corrupt the parsed tree.
    if (!text.startsWith(previous)) {
      document.fail({
        kind: "source",
        code: "source-replaced",
        message:
          "The source was replaced. Start a new renderer instance (a new key) before replacing the document.",
      });
      return;
    }
    if (finalized.current && text.length !== previous.length) {
      document.fail({
        kind: "source",
        code: "source-after-final",
        message:
          "The source grew after the document was finalized. Start a new renderer instance before restarting the document.",
      });
      return;
    }
    const suffix = text.slice(previous.length);
    if (suffix || (!isStreaming && !finalized.current)) {
      environmentRef.current.onInput?.({ length: text.length });
      const input: StreamInput = { suffix, complete: !isStreaming };
      if (componentNames !== sentNames.current) {
        input.components = componentNames.split("\n");
        sentNames.current = componentNames;
      }
      worker.current?.postMessage(input);
    }
    previousText.current = text;
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
      data-dil-document="dil"
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
                document.report({
                  kind: "runtime",
                  code: "component-render-failed",
                  message,
                })
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
