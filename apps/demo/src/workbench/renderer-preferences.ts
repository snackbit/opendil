import type { RenderMode } from "../demo-renderer";
import { DEMO_RENDER_MODE } from "../playback/defaults";
const storageKey = "opendil:renderer-preferences:v2";
export interface RendererPreferences {
  mode: RenderMode;
  reveal: boolean;
}
export function rendererPreferences(): RendererPreferences {
  const defaults: RendererPreferences = {
    mode: DEMO_RENDER_MODE,
    reveal: true,
  };
  try {
    const value: unknown = JSON.parse(
      sessionStorage.getItem(storageKey) ?? "null",
    );
    if (!value || typeof value !== "object") return defaults;
    return {
      mode:
        "mode" in value &&
        (value.mode === "isolated" ||
          value.mode === "shadow" ||
          value.mode === "host")
          ? value.mode
          : defaults.mode,
      reveal:
        "reveal" in value && typeof value.reveal === "boolean"
          ? value.reveal
          : defaults.reveal,
    };
  } catch {
    return defaults;
  }
}
export function saveRendererPreferences(value: RendererPreferences) {
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(value));
  } catch {
    /* Navigation still works without storage. */
  }
}
