"use client";
import {
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";
import { Maximize2 } from "lucide-react";
import mermaid, { type MermaidConfig } from "mermaid";
import DOMPurify from "dompurify";
import { CodeFrame } from "./code/code-frame";
import { DiagramOpenContext, type DilDiagram } from "../customization";
import { DilExportError, standaloneSvg } from "../export/svg-export";
import { stripRemoteReferences } from "../svg-safety";
import { PendingBlock } from "../view/loading-block";
import { useUiPrimitives } from "../ui-primitives";
import { usePortalScope } from "../../components/ui/overlays/ui-scope";
import { RenderCache } from "./render-cache";
const SOURCE_LIMIT = 8192;
const EDGE_LIMIT = 100;
type MermaidProblem = "oversized" | "unsupported" | "edges" | "invalid";
// Each notice says why there is no diagram; the source, with copy, follows it.
const NOTICES: Record<MermaidProblem, string> = {
  oversized: `Diagram source is longer than ${SOURCE_LIMIT.toLocaleString("en-US")} characters.`,
  unsupported: "Diagram uses a Mermaid feature that is not supported.",
  edges: `Diagram has more than ${EDGE_LIMIT} edges.`,
  invalid: "Diagram is incomplete or invalid.",
};
// Mermaid configuration is global; a host application may change it between renders.
const CONFIG: MermaidConfig = {
  startOnLoad: false,
  securityLevel: "strict",
  maxTextSize: SOURCE_LIMIT,
  maxEdges: EDGE_LIMIT,
  htmlLabels: false,
  flowchart: { htmlLabels: false },
  theme: "neutral",
};
/**
 * Mermaid's SVG without scripts, links, foreign content, or anything that
 * could fetch, such as an @import or a remote url() in its styles.
 */
export function sanitizeDiagram(svg: string): string {
  const fragment = DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: false },
    FORBID_TAGS: ["foreignObject", "script", "a", "image", "use"],
    FORBID_ATTR: ["href", "xlink:href"],
    RETURN_DOM_FRAGMENT: true,
  });
  const root = fragment.firstElementChild;
  if (!root) return "";
  stripRemoteReferences(root);
  return root.outerHTML;
}
function diagramDetails(markup: string, source: string): DilDiagram {
  const { markup: svg, width, height } = standaloneSvg(markup);
  const title = new DOMParser()
    .parseFromString(markup, "text/html")
    .querySelector("svg > title")
    ?.textContent?.trim();
  return {
    kind: "mermaid",
    svg,
    source,
    title: title || undefined,
    width,
    height,
  };
}
/**
 * Sanitized diagrams by source. Mermaid's configuration here is constant, so
 * a diagram that mounts again, as in a virtualized row or an adopted answer,
 * shows in its first commit instead of parsing and laying out for 100 ms.
 */
const DIAGRAMS = new RenderCache<{ markup: string; id: string }>(32, 2_000_000);
/** Mermaid scopes a diagram's styles and markers by its id; each instance gets its own. */
function cachedDiagram(source: string, id: string) {
  const cached = DIAGRAMS.get(source);
  if (!cached) return "";
  const root = new DOMParser().parseFromString(
    cached.markup,
    "image/svg+xml",
  ).documentElement;
  const elements = [root, ...root.querySelectorAll("*")];
  const ids = new Map<string, string>();
  for (const element of elements) {
    if (element.id.includes(cached.id)) {
      const replacement = element.id.replaceAll(cached.id, id);
      ids.set(element.id, replacement);
      element.id = replacement;
    }
  }
  const reference = (_match: string, quote: string, target: string) =>
    `url(${quote}#${ids.get(target) ?? target}${quote})`;
  const urls = (value: string) =>
    value.replace(/url\(\s*(["']?)#([\w-]+)\1\s*\)/g, reference);
  for (const element of elements) {
    if (element.localName === "style") {
      // Only selector preludes and local url() references contain SVG IDs;
      // declarations and authored text can contain the same literal string.
      element.textContent = urls(element.textContent ?? "").replace(
        /(^|[{}])([^{}]*)(?=\{)/g,
        (_match, boundary: string, selector: string) =>
          boundary +
          selector.replace(/#([\w-]+)/g, (match, target: string) =>
            ids.has(target) ? `#${ids.get(target)}` : match,
          ),
      );
    }
    for (const attribute of [...element.attributes]) {
      if (/^aria-(labelledby|describedby)$/.test(attribute.name)) {
        element.setAttribute(
          attribute.name,
          attribute.value.replace(
            /\S+/g,
            (target) => ids.get(target) ?? target,
          ),
        );
      } else if (
        /^(style|fill|stroke|filter|clip-path|mask|marker-start|marker-mid|marker-end)$/.test(
          attribute.name,
        )
      ) {
        element.setAttribute(attribute.name, urls(attribute.value));
      }
    }
  }
  return root.outerHTML;
}
export interface MermaidDiagramProps {
  source: string;
  presentationRef?: ((element: HTMLElement | null) => void) | undefined;
  /** The height a snapshot measured, held while the diagram lays out. */
  reserve?: number | undefined;
}
export function MermaidDiagram({
  source,
  presentationRef,
  reserve,
}: MermaidDiagramProps) {
  const id = "dil" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const [error, setError] = useState<MermaidProblem | undefined>();
  const [markup, setMarkup] = useState(() => cachedDiagram(source, id));
  const openDiagram = useContext(DiagramOpenContext);
  const { Button, Tooltip } = useUiPrimitives();
  const { container } = usePortalScope();
  useEffect(() => {
    let active = true;
    setError(undefined);
    const rejected =
      source.length > SOURCE_LIMIT
        ? "oversized"
        : // Metadata nodes can load images during Mermaid layout, before SVG
          // sanitization. Refuse the whole syntax, including quoted/escaped keys.
          /@\s*\{|%%\{|click\s|classDef\s|(?:^|\n)\s*(?:style|linkStyle)\s|<|^---/m.test(
              source,
            )
          ? "unsupported"
          : undefined;
    if (rejected) {
      queueMicrotask(() => setError(rejected));
      return;
    }
    const known = cachedDiagram(source, id);
    if (known) {
      setMarkup(known);
      return;
    }
    // Parsing and laying out a diagram takes about 100 ms of main-thread
    // work. It waits for an idle moment, so the frames in which an answer
    // settles stay short; its placeholder holds the space meanwhile.
    const render = () => {
      if (!active) return;
      mermaid.initialize(CONFIG);
      mermaid
        .render(id, source)
        .then((result) => {
          const sanitized = sanitizeDiagram(result.svg);
          // Kept even when this instance unmounted meanwhile: the layout is done.
          DIAGRAMS.set(source, { markup: sanitized, id }, sanitized.length);
          if (active) setMarkup(sanitized);
        })
        .catch((reason: unknown) => {
          document.getElementById("d" + id)?.remove();
          if (active)
            setError(
              reason instanceof Error &&
                /Edge limit exceeded/.test(reason.message)
                ? "edges"
                : "invalid",
            );
        });
    };
    const idle = typeof requestIdleCallback === "function";
    const handle = idle
      ? requestIdleCallback(render, { timeout: 300 })
      : setTimeout(render, 0);
    return () => {
      active = false;
      if (idle) cancelIdleCallback(handle as number);
      else clearTimeout(handle);
    };
  }, [source, id]);
  // Prepared once per diagram. A diagram without a size cannot be exported
  // or viewed standalone, so it gets no open button.
  const diagram = useMemo(() => {
    if (!openDiagram || !markup) return undefined;
    try {
      return diagramDetails(markup, source);
    } catch (reason) {
      if (reason instanceof DilExportError) return undefined;
      throw reason;
    }
  }, [openDiagram, markup, source]);
  const open = useCallback(() => {
    if (openDiagram && diagram) openDiagram(diagram);
  }, [openDiagram, diagram]);
  // Rendering is asynchronous; hold the space a diagram is likely to need.
  if (!markup && !error)
    return <PendingBlock name="Mermaid" reserve={reserve} />;
  return (
    <div
      ref={presentationRef}
      aria-label="Mermaid diagram"
      data-dil-copy="code"
      data-dil-copy-language="mermaid"
      data-dil-copy-source={source}
      className="relative overflow-hidden"
    >
      {error ? (
        <div className="flex flex-col gap-2" data-dil-mermaid-problem={error}>
          <p role="alert">{NOTICES[error]} Its source is shown instead.</p>
          <CodeFrame source={source} language="mermaid" ready />
        </div>
      ) : (
        <>
          <div dangerouslySetInnerHTML={{ __html: markup }} />
          {diagram && (
            <div className="absolute top-1 right-1" data-dil-copy="skip">
              <Tooltip portalContainer={container} label="Open diagram">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Open diagram"
                  onClick={open}
                >
                  <Maximize2 size={16} />
                </Button>
              </Tooltip>
            </div>
          )}
        </>
      )}
    </div>
  );
}
