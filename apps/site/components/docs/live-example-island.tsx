"use client";
import "./docs-components.css";
import dynamic from "next/dynamic";
import type { ExampleId } from "@/lib/examples/catalog";
import type { LiveExampleMode } from "./live-example-workbench";
import { useVisibleExample } from "./use-visible-example";

// Client-only and loaded when visible: the renderer, Monaco and the replay worker stay off pages without examples.
const LiveExampleWorkbench = dynamic(() => import("./live-example-workbench"), {
  ssr: false,
  loading: () => <div className="od-live-placeholder">Loading example…</div>,
});

export interface LiveExampleIslandProps {
  id: ExampleId;
  title: string;
  /** Null for the scale fixtures, which the browser generates. */
  source: string | null;
  mode?: LiveExampleMode | undefined;
}

export function LiveExampleIsland({
  id,
  title,
  source,
  mode,
}: LiveExampleIslandProps) {
  const { root, visible } = useVisibleExample();
  return (
    <div
      className="not-prose od-live-example"
      data-live-example={id}
      ref={root}
    >
      <div className="od-example-toolbar">
        <span>Live example</span>
      </div>
      {visible ? (
        <LiveExampleWorkbench id={id} original={source} mode={mode} />
      ) : (
        <div className="od-live-placeholder">{title}</div>
      )}
    </div>
  );
}
