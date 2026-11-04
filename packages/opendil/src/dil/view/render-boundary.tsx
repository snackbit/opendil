"use client";
import { Component, useEffect, type ReactNode } from "react";
import { useStore } from "zustand";
import type { DilDocument } from "../runtime/document";
import type { DilRenderError } from "../render-error";
interface RenderBoundaryProps {
  revision: string;
  streaming: boolean;
  children: ReactNode;
  /** Receives the error readers see once the message is final. */
  onError?: ((message: string) => void) | undefined;
}
interface BoundaryState {
  error: string;
  revision: string;
}
export class RenderBoundary extends Component<
  RenderBoundaryProps,
  BoundaryState
> {
  override state: BoundaryState = { error: "", revision: "" };
  static getDerivedStateFromProps(
    props: RenderBoundaryProps,
    state: BoundaryState,
  ) {
    return props.revision === state.revision
      ? null
      : { revision: props.revision, error: "" };
  }
  static getDerivedStateFromError(error: unknown) {
    return {
      error:
        error instanceof Error ? error.message : "Cannot render this component",
    };
  }
  override componentDidMount() {
    this.reportShownError();
  }
  override componentDidUpdate() {
    this.reportShownError();
  }
  private reportShownError() {
    if (this.state.error && !this.props.streaming)
      this.props.onError?.(this.state.error);
  }
  override render() {
    if (this.state.error)
      return this.props.streaming ? null : (
        <div
          role="alert"
          className="rounded border border-destructive/30 p-3 text-sm text-destructive"
        >
          {this.state.error}
        </div>
      );
    return this.props.children;
  }
}
/**
 * Reports a problem that readers see once the message is final; until then,
 * later source can still resolve it. Reporting from an effect keeps the host's
 * onError out of React's render phase. The document drops repeated reports.
 */
export function useReportProblem(
  document: DilDocument,
  problem: DilRenderError | undefined,
) {
  const complete = useStore(document.status, (state) => state.complete);
  const kind = problem?.kind;
  const message = problem?.message;
  const offset = problem?.offset;
  useEffect(() => {
    if (!complete || kind === undefined || message === undefined) return;
    document.report(
      offset === undefined ? { kind, message } : { kind, message, offset },
    );
  }, [document, complete, kind, message, offset]);
}
