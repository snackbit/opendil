import { createContext, useContext } from "react";
import type { DilRenderError } from "./render-error";

/**
 * The visible part of a renderer's scroller. Offsets are measured from the
 * renderer's top, so layout around the renderer does not move its content.
 */
export interface RendererViewport {
  /** Distance from the renderer's top to the top of the visible area. */
  readonly offset: number;
  readonly height: number;
  readonly width: number;
  /** The renderer's top in client coordinates, the origin of `offset`. */
  origin(): number;
  subscribe(listener: () => void): () => void;
  /** Scrolls until `offset` is at the top of the visible area. */
  scrollTo(offset: number): void;
}
export interface RendererMetrics {
  scanned: number;
  complete: boolean;
  /** The document was finalized while some of its structure was still open. */
  incomplete: boolean;
}
export interface RendererEnvironment {
  viewport?: RendererViewport;
  copy?: (text: string) => Promise<boolean>;
  onInput?: (detail: { length: number }) => void;
  onCommit?: (detail: RendererMetrics) => void;
  onError?: (error: DilRenderError) => void;
}
export const RendererEnvironmentContext = createContext<RendererEnvironment>(
  {},
);
export function useRendererEnvironment() {
  return useContext(RendererEnvironmentContext);
}
