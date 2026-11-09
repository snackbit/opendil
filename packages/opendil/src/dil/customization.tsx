import {
  createContext,
  useContext,
  type ComponentType,
  type ReactNode,
} from "react";
import type { DilMarkdownComponents } from "./markdown/markdown-components";
import type { DilDiagnostics } from "./render-error";
import type { DilUiPrimitives } from "./ui-primitives";

export interface DilComponentProps {
  name: string;
  attributes: Readonly<Record<string, unknown>>;
  config: Readonly<Record<string, unknown>>;
  children: ReactNode;
  className: string;
  slots: Readonly<Record<string, string>>;
  ready: boolean;
  invoke: (attribute: string, value?: unknown) => void;
  /** Forward to the visual root to participate in progressive reveal. */
  presentationRef?: ((element: HTMLElement | null) => void) | undefined;
}
/** A rendered diagram, as `onOpenDiagram` receives it. */
export interface DilDiagram {
  kind: "mermaid";
  /** The sanitized SVG the reader sees, as a standalone SVG document. */
  svg: string;
  /** The diagram source from the answer. */
  source: string;
  /** The diagram's accessible title, from Mermaid's `accTitle`, if any. */
  title: string | undefined;
  /** Natural size in CSS pixels, from the SVG's viewBox. */
  width: number;
  height: number;
}
/**
 * Renderer props that customize host and Shadow DOM rendering. A new object
 * with the same members, as from an inline literal, changes nothing.
 */
export interface DilCustomization {
  components?: Readonly<Record<string, ComponentType<DilComponentProps>>>;
  componentConfig?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  classNames?: Readonly<Record<string, string>>;
  slots?: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /** Host renderers for Markdown links, images, code, headings, quotes, and tables. */
  markdownComponents?: DilMarkdownComponents;
  /** Where problems are logged and how readers see them. */
  diagnostics?: DilDiagnostics;
  /**
   * Your design system's controls and overlays, used inside stock widgets in
   * place of OpenDIL's own. Pass stable components: a new component function
   * remounts the widgets that use it.
   */
  uiPrimitives?: DilUiPrimitives;
  /**
   * Adds an "Open diagram" button to rendered diagrams (`<Mermaid>` and
   * mermaid fences) that hands the diagram to this function, for example to
   * show it in your own zoomable viewer. Without it, diagrams only render
   * inline.
   */
  onOpenDiagram?: ((diagram: DilDiagram) => void) | undefined;
}
export const CustomizationContext = createContext<DilCustomization>({});
/** The host's `onOpenDiagram`, for DilRenderer and MarkdownRenderer alike. */
export const DiagramOpenContext = createContext<
  ((diagram: DilDiagram) => void) | undefined
>(undefined);
export function useCustomization() {
  return useContext(CustomizationContext);
}
