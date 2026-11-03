"use client";
import { useEffect, useId, useState } from "react";
import mermaid, { type MermaidConfig } from "mermaid";
import DOMPurify from "dompurify";
// Mermaid configuration is global; a host application may change it between renders.
const CONFIG: MermaidConfig = {
  startOnLoad: false,
  securityLevel: "strict",
  maxTextSize: 8192,
  maxEdges: 100,
  htmlLabels: false,
  flowchart: { htmlLabels: false },
  theme: "neutral",
};
export interface MermaidDiagramProps {
  source: string;
  presentationRef?: ((element: HTMLElement | null) => void) | undefined;
}
export function MermaidDiagram({
  source,
  presentationRef,
}: MermaidDiagramProps) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [error, setError] = useState("");
  const [markup, setMarkup] = useState("");
  useEffect(() => {
    let active = true;
    setError("");
    if (
      source.length > 8192 ||
      /%%\{|click\s|classDef\s|(?:^|\n)\s*(?:style|linkStyle)\s|<|^---/m.test(
        source,
      )
    ) {
      queueMicrotask(() => setError("Unsupported or oversized Mermaid source"));
      return;
    }
    mermaid.initialize(CONFIG);
    mermaid
      .render("dil" + id, source)
      .then((result) => {
        if (active)
          setMarkup(
            DOMPurify.sanitize(result.svg, {
              USE_PROFILES: { svg: true, svgFilters: false },
              FORBID_TAGS: ["foreignObject", "script", "a"],
              FORBID_ATTR: ["href", "xlink:href"],
            }),
          );
      })
      .catch(() => {
        document.getElementById("ddil" + id)?.remove();
        if (active) setError("Diagram is incomplete or invalid");
      });
    return () => {
      active = false;
    };
  }, [source, id]);
  if (!markup && !error) return null;
  return (
    <div
      ref={presentationRef}
      aria-label="Mermaid diagram"
      className="overflow-hidden"
    >
      <div dangerouslySetInnerHTML={{ __html: markup }} />
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
