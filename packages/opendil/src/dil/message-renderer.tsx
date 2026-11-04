"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useImperativeHandle,
  type Ref,
} from "react";
import type { DilRendererHandle } from "./renderer-handle";
import { useStore } from "zustand";
import type { TreeBatch } from "./parser/types";
import { DilDocument } from "./runtime/document";
import { startInlineWorker } from "./runtime/inline-worker";
import { NodeView } from "./view/node-view";
import { RenderBoundary } from "./view/render-boundary";
import { useRendererEnvironment } from "./renderer-environment";
import { useProgressiveReveal } from "./view/progressive-reveal";
import { RevealContext } from "./view/reveal/presentation";
import type { ProgressiveReveal } from "./view/reveal-options";
import { useStreamFollow } from "./view/stream-follow";
import type { AutoScroll } from "./view/scroll-options";
import type { UpdateInterval } from "./runtime/presentation-scheduler";

export interface MessageRendererProps {
  rendererRef?: Ref<DilRendererHandle> | undefined;
  text: string;
  isStreaming?: boolean;
  showStatus?: boolean;
  progressiveReveal?: ProgressiveReveal;
  autoScroll?: AutoScroll;
  updateInterval?: UpdateInterval;
  onFollowChange?: ((following: boolean) => void) | undefined;
}
function DocumentFeedback({
  document,
  showStatus,
}: {
  document: DilDocument;
  showStatus: boolean;
}) {
  const error = useStore(document.status, (state) => state.error);
  const copied = useStore(document.status, (state) => state.clipboard?.ok);
  const complete = useStore(document.status, (state) => state.complete);
  const scanned = useStore(document.status, (state) => state.scanned);
  return (
    <div data-complete={complete} data-scanned={scanned}>
      {showStatus && (
        <span
          role="status"
          className="mb-4 block text-xs text-muted-foreground"
        >
          {complete ? "Complete" : "Receiving document"}
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
export function MessageRenderer({
  rendererRef,
  text,
  isStreaming = false,
  showStatus = true,
  progressiveReveal = false,
  autoScroll = false,
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
  const presentation = useProgressiveReveal(root, progressiveReveal, document);
  const { resume } = useStreamFollow(
    root,
    autoScroll,
    isStreaming || (streamed && !rendered),
    onFollowChange,
  );
  useImperativeHandle(rendererRef, () => ({ resumeAutoScroll: resume }), [
    resume,
  ]);
  const worker = useRef<Worker | null>(null);
  const previousLength = useRef(0);
  const finalized = useRef(false);
  const environment = useRendererEnvironment();
  const environmentRef = useRef(environment);
  useEffect(() => {
    environmentRef.current = environment;
  }, [environment]);
  useEffect(() => {
    const document = new DilDocument();
    previousLength.current = 0;
    finalized.current = false;
    let frame = 0;
    let queued: TreeBatch[] = [];
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
      });
      setRendered(last.complete);
      environmentRef.current.onCommit?.({
        scanned: last.scanned,
        complete: last.complete,
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
      const result = action
        ? action(text)
        : navigator.clipboard.writeText(text).then(
            () => true,
            () => false,
          );
      void result.then((ok) =>
        document.status.setState({ clipboard: { intent, ok } }),
      );
    };
    document.engine.events.addEventListener("dil:copy", copy);
    const parser = startInlineWorker(__DIL_PARSER_WORKER__, {
      role: "document parser",
      crashMessage:
        "The document parser stopped. Remount the renderer to try again.",
      onMessage: (batch: TreeBatch) => {
        queued.push(batch);
        if (!frame)
          frame = requestAnimationFrame(() => {
            frame = 0;
            document.updates.enqueue("source", publish);
          });
      },
      onStop: (error) => document.status.setState({ error }),
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
      document.status.setState({ error: "Message source limit exceeded" });
      return;
    }
    if (
      text.length < previousLength.current ||
      (finalized.current && text.length !== previousLength.current)
    ) {
      document.status.setState({
        error:
          "Start a new renderer instance before replacing or restarting the document.",
      });
      return;
    }
    const suffix = text.slice(previousLength.current);
    if (suffix || (!isStreaming && !finalized.current)) {
      environmentRef.current.onInput?.({ length: text.length });
      worker.current?.postMessage({ suffix, complete: !isStreaming });
    }
    previousLength.current = text.length;
    finalized.current = !isStreaming;
  }, [text, isStreaming, document]);
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
        <>
          <DocumentFeedback document={document} showStatus={showStatus} />
          <RevealContext.Provider value={presentation}>
            <RenderBoundary revision="document" streaming={isStreaming}>
              <div className="dil-flow" data-dil-content>
                <NodeView id={0} document={document} />
              </div>
            </RenderBoundary>
          </RevealContext.Provider>
        </>
      )}
    </div>
  );
}
