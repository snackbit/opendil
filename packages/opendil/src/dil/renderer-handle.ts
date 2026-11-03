export interface DilRendererHandle {
  /** Explicitly resume following this streaming message and move to its tail. */
  resumeAutoScroll(): void;
}
