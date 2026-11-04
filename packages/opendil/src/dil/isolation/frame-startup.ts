declare const __DIL_VERSION__: string;

/** Package version, compiled into both the renderer and the copied frame runtime. */
export const RUNTIME_VERSION =
  typeof __DIL_VERSION__ === "string" ? __DIL_VERSION__ : "development";
/**
 * The frame script runs before the frame document's load event, so a frame that
 * loaded without announcing itself is not the OpenDIL runtime.
 */
export const READY_AFTER_LOAD_MS = 3000;
/** Upper bound for when the load event was missed, e.g. before hydration. */
export const READY_TIMEOUT_MS = 20000;

const reported = new Set<string>();
function reportOnce(key: string, report: () => void) {
  if (reported.has(key)) return;
  reported.add(key);
  report();
}

export function startupFailureMessage(url: string) {
  return `OpenDIL's runtime frame did not start from ${url}. Copy the runtime with "npx opendil copy-assets --out public/opendil" and set runtimeBaseUrl to the URL that serves it, including your app's base path.`;
}

export function reportStartupFailure(url: string) {
  reportOnce("start:" + url, () =>
    console.error(
      "OpenDIL: " +
        startupFailureMessage(url) +
        " The URL answered without the OpenDIL runtime; it may be missing or be your app's 404 or index page.",
    ),
  );
}

/** Warns once per frame URL when the copied runtime and the renderer differ. */
export function checkFrameVersion(url: string, version: unknown) {
  if (version === RUNTIME_VERSION) return;
  const frame =
    typeof version === "string" && /^[\w.+-]{1,64}$/.test(version)
      ? "version " + version
      : "an earlier version";
  reportOnce("version:" + url, () =>
    console.warn(
      `OpenDIL: the runtime frame at ${url} is ${frame}, but the renderer is version ${RUNTIME_VERSION}. Run "npx opendil copy-assets --out <public directory>" again so the copied runtime matches the installed package.`,
    ),
  );
}

export function reportRejectedTokens(names: readonly string[]) {
  for (const name of names)
    reportOnce("token:" + name, () =>
      console.warn(
        `OpenDIL: the iframe renderer ignores theme token ${JSON.stringify(name)}. Tokens must be CSS custom properties (--name) with values that cannot load resources or contain ; { } @ \\ ! < > or comments.`,
      ),
    );
}
