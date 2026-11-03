import { createContext, useContext } from "react";

export interface FrameViewport {
  offset: number;
  revision: number;
  height: number;
  width: number;
  listeners: Set<() => void>;
}
export interface RendererMetrics {
  scanned: number;
  complete: boolean;
}
export interface RendererEnvironment {
  viewport?: FrameViewport;
  scrollTo?: (offset: number) => void;
  copy?: (text: string) => Promise<boolean>;
  onInput?: (detail: { length: number }) => void;
  onCommit?: (detail: RendererMetrics) => void;
}
export const RendererEnvironmentContext = createContext<RendererEnvironment>(
  {},
);
export function useRendererEnvironment() {
  return useContext(RendererEnvironmentContext);
}
