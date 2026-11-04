---
"@snackbit/opendil": minor
---

Make the default iframe mode themeable, self-diagnosing, content-sized and lighter.

- `appearance` and `tokens` now work in every mode, including the default iframe
  mode. They reach the frame through its private message channel and update live
  without reloading the frame. The iframe mode keeps only tokens that are CSS
  custom properties (`--name`, at most 256) whose values are at most 256
  characters, have balanced quotes and contain no `url(`, `image-set(`,
  `image(`, `cross-fade(`, `element(`, `src(`, `;`, `{`, `}`, `@`, `\`, `!`,
  `<`, `>` or comments. It ignores other tokens and logs one `console.warn` per
  token name. The frame background follows `--background` as in the host and
  Shadow DOM modes; set `tokens={{ "--background": "transparent" }}` to show
  the page behind the message. The frame and the `<iframe>` element use the same
  `color-scheme`, so browsers no longer paint an opaque backdrop behind a
  transparent frame. Sandbox, Content Security Policy and the opaque origin are
  unchanged.
- `components`, `componentConfig`, `classNames`, `slots`, `className` and
  `shadowStyles` still require `mode="host"` or `mode="shadow"`, but passing them
  as `undefined` no longer throws in the iframe mode. `runtimeBaseUrl` is
  accepted in every mode and ignored by host and Shadow DOM rendering, so a mode
  held in a `"isolated" | "shadow" | "host"` variable type-checks with
  `runtimeBaseUrl`, `appearance`, `tokens` and every other prop that all modes
  accept. TypeScript reports the excluded props as `undefined` instead of
  `never`.
- When the frame does not start, for example because `npx opendil copy-assets`
  was skipped or `runtimeBaseUrl` misses the app's base path, the renderer
  replaces the frame with an error that names the URL it tried, and logs one
  `console.error` per URL. It reports this 3 seconds after a frame document
  loaded without announcing itself, at once when `frame.js` fails to load, and
  after 20 seconds when the frame has sent nothing at all, for example because
  its load event fired before the renderer hydrated. A slow download is not an
  error: `frame.html` pings the renderer every second until `frame.js` runs.
  The frame now announces its package version; when the copied runtime and the
  installed package differ, the renderer logs one `console.warn` asking you to
  run `copy-assets` again.
- A renderer whose effects restart while its frame stays mounted, such as
  under React `<Activity>` or when a router restores a cached page, reconnects
  to the same frame document instead of leaving the message disconnected.
- The frame is sized to its content. It starts at 0 px instead of 400 px and no
  longer keeps a 200 px minimum, so a one-line answer is one line tall. An open
  popover or tooltip grows the frame until it closes, so it is not clipped. It
  opens on its preferred side when the scroller has room there, also below the
  frame's current bottom. A popover that would flip above its trigger and be cut
  off by the frame's top opens below the trigger instead, even if the reader has
  to scroll to it.
- Host and Shadow DOM rendering, with the embedded parser and QuickJS workers,
  moved into a chunk that loads the first time a page renders `mode="host"` or
  `mode="shadow"`. An iframe-only Vite app's entry chunk shrinks from 2.86 MB
  (1.05 MB gzip) to about 241 kB (76 kB gzip), of which React is 219 kB (69 kB
  gzip). The QuickJS WebAssembly module is embedded once instead of twice, so
  `frame.js` shrinks from 8.1 MB to 7.4 MB and the host chunk by 0.67 MB.
  Until that chunk has loaded, the first host or Shadow DOM message renders
  nothing: its `ref` stays `null`, synchronous `renderToString` leaves it out,
  and tests that render it must wait for it. Streaming server rendering waits
  for the chunk. Call the new `preloadHostRenderer()` early, for example at
  module scope, to make those modes render synchronously once it resolves; a
  chunk that fails to load reaches the app's error boundary and is retried on
  the next render. Both modes render inside a `Suspense` boundary with an empty
  fallback, as Shadow DOM mode already did, so a custom component that suspends
  hides its message until it resolves; wrap such components in your own
  `Suspense` to show a fallback.
- Copy the runtime assets again after upgrading, since `frame.html` and
  `frame.js` changed. Frames copied from earlier releases still start, but
  they do not ping during a slow download or reconnect after an effect restart.
