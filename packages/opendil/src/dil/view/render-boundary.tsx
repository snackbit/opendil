"use client";
import { Component, type ReactNode } from "react";
interface RenderBoundaryProps {
  revision: string;
  streaming: boolean;
  children: ReactNode;
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
