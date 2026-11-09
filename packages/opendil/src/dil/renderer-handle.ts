import type { DilSerializedDocument } from "./serialize/serialize-document";

export interface DilRendererHandle {
  /** Explicitly resume following this streaming message and move to its tail. */
  resumeAutoScroll(): void;
  /**
   * What the renderer shows now, as sanitized HTML and as Markdown, for a
   * clipboard. Null in iframe mode, whose document the page cannot read.
   */
  serialize(): DilSerializedDocument | null;
}
