import "./workbench.css";
import "@/components/playback/playback.css";
import type { ReactNode, Ref } from "react";
import { StreamProgress } from "@/components/playback/stream-progress";
import { ShellScope } from "./shell-scope";

export interface StreamingWorkbenchProps {
  selection: ReactNode;
  actions: ReactNode;
  source: ReactNode;
  preview: ReactNode;
  fraction: number;
  run: number;
  sourceFooter?: ReactNode;
  outputRef?: Ref<HTMLDivElement>;
  rootRef?: Ref<HTMLDivElement>;
  scrollPadding?: number;
  /** Extra class on the root, e.g. the landing hero's narrow-screen page-scroll layout. */
  className?: string;
}

/** The homepage's bounded source/preview workbench, shared by editable demos. */
export function StreamingWorkbench({
  selection,
  actions,
  source,
  preview,
  fraction,
  run,
  sourceFooter,
  outputRef,
  rootRef,
  scrollPadding = 0,
  className,
}: StreamingWorkbenchProps) {
  return (
    <div
      className={className ? `od-stream-demo ${className}` : "od-stream-demo"}
      ref={rootRef}
    >
      <div className="od-hero-demo-toolbar">
        <div className="od-demo-caption">
          <i />
          <i />
          <i />
          {selection}
        </div>
        <ShellScope className="od-demo-actions">{actions}</ShellScope>
      </div>
      <StreamProgress fraction={fraction} run={run} />
      <div className="od-hero-demo">
        <div className="od-hero-code">
          {source}
          {sourceFooter}
        </div>
        <div className="od-hero-preview">
          <div
            className="od-hero-output"
            ref={outputRef}
            tabIndex={0}
            aria-label="Streaming preview"
            style={{ paddingBottom: 16 + scrollPadding }}
          >
            {preview}
          </div>
        </div>
      </div>
    </div>
  );
}
