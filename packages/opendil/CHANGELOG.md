# @snackbit/opendil

## 0.2.1

### Patch Changes

- c1e27ab: Report a failed copy instead of throwing where the Clipboard API is unavailable, such as pages served over plain HTTP. `GenUI.copy` actions now always show their "Copied" or "Copy failed" feedback in every rendering mode, also when a host `copy` handler throws, and the iframe renderer no longer requires the User Activation API (Safari before 16.4).

## 0.2.0

### Minor Changes

- 25bb8fc: Make the default iframe mode themeable, self-diagnosing, content-sized and lighter.

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

- 25bb8fc: Keep interrupted answers readable and report rendering problems to the host.

  - A document that is finalized while some of its structure is still open, for
    example after the reader presses Stop, the model reaches its output limit, or
    the stream fails, keeps everything it completed. Open elements such as a
    `<grid>` render their finished children instead of being replaced by
    "Unfinished grid at character 1437". An unfinished opening tag (including a
    cut-off name such as `<butt` or a lone `<`), expression, closing tag
    (including a cut-off `</CodeBlock>`), or `{#each}` template is left out. A
    short note, "This response ended before it was finished.", follows the
    content, also when `showStatus` is `false`. With `showStatus` on, the status
    label reads "Incomplete" instead of "Complete". The element that carries
    `data-complete` also carries `data-incomplete="true"`, and `onCommit`
    receives `incomplete: true`.
  - Only unfinished DIL structure marks a document incomplete. A response cut off
    in the middle of plain prose still reads "Complete", because the text alone
    does not show that it was interrupted.
  - Malformed DIL now shows readers "This part of the response couldn't be
    shown." instead of developer messages with character offsets such as
    "Expected quoted value or expression for max at character 124".
  - The new `onError` prop receives each distinct problem once, in every mode, as
    a `DilRenderError` with `kind` (`"incomplete"`, `"syntax"`, `"runtime"`,
    `"limit"`, or `"source"`), a developer-facing `message`, and, for parse
    problems, the `offset` in `text`. The iframe mode forwards errors from its
    frame through the private message channel, and the host validates them before
    calling `onError`. Problems with a source position and incomplete documents
    are also logged with `console.warn`, including their positions. Runtime and
    limit failures of the whole message keep their existing message on the page.
    One message reports at
    most 20 problems, then a single `limit` error saying later ones are not
    reported; the `incomplete` report still arrives, and messages are capped at
    2000 characters. The iframe host enforces the same bound on what its frame
    sends. An exception thrown by `onError` is rethrown asynchronously instead of
    interrupting rendering.
  - Once a message is final, problems that readers see in one part of it also
    reach `onError` and `console.warn` with the part's `offset`: an inline
    expression that cannot be evaluated (readers still see "Cannot evaluate this
    value.") and a component whose attributes cannot be evaluated or that fails
    to render are `runtime` errors whose message includes the expression or
    component and the reason. A component name that is neither a stock component
    nor one passed in `components`, such as `<Foo>`, is a `syntax` error. These
    components show readers "This part of the response couldn't be shown."
    instead of the evaluation error or "Unsupported DIL component: Foo". While
    the message streams, nothing is reported, because later source can still
    define a missing binding.
  - A finished message without content, such as an answer whose request failed
    before any text arrived, no longer shows the "Complete" status label.
  - A message that exceeds the parser's node limit now reports a `limit` error,
    shows "Rendering stopped: this message has more parts than the renderer
    supports." instead of asking the reader to remount, and finishes as
    complete instead of staying at "Receiving document".
  - Finalizing does not need new text: switching `isStreaming` to `false` with the
    same `text` finalizes the message. With the AI SDK, a text part's `state` can
    stay `"streaming"` after `stop()` or a stream error, so derive `isStreaming`
    from the chat `status` as well, for example
    `part.state === "streaming" && status === "streaming"`.
  - `RendererMetrics` has a new `incomplete` field. Copy the runtime assets again
    after upgrading so the iframe mode reports errors and the incomplete flag;
    frames copied from earlier releases still work but report neither.

- 25bb8fc: Render ordinary Markdown answers reliably and use fewer workers per message.

  - Inline code spans are now literal DIL source, like fenced code. `` `{ leading: false }` ``
    renders as code instead of "Cannot evaluate this value.", and `` `<div>` `` no longer
    opens a component that ends in "Unfinished div". Spans follow Markdown: a run of one
    or more backticks closes at the next run of the same length. A span ends at a blank
    line or at a line that starts a list item, heading, blockquote, fence, component tag,
    or block directive, so a stray backtick cannot hide the components after it. An
    escaped or unmatched backtick protects nothing. While streaming, the text of an open
    span appears once its closing backticks arrive or its block ends. Expressions inside
    backticks, such as `` `{user.id}` ``, no longer evaluate; put an expression outside
    the backticks to show its value.
  - Fences follow Markdown more closely: longer fences (for example four backticks) can
    contain three-backtick lines, and fences inside list items, blockquotes, or right after
    a tag are recognized. A closing fence must be alone on its line, except that a
    component closing tag or block directive may follow it, as in ` ```</box> `.
  - Lowercase HTML-like tags in prose that are not DIL tags, such as `<div>`, `</span>`, or
    `<br/>`, and autolinks such as `<https://example.com>` now display as plain text
    instead of producing "Unexpected closing tag" or "Unfinished ..." errors that hid the
    rest of the message. Braces in their quoted or braced attribute values stay text; any
    other brace is an expression, so `a<b then {total}` still shows the value. Capitalized
    unknown tags still render the "Unsupported DIL component" error. Lowercase names
    registered through `components` remain components.
  - Each message now stops its parser worker once the final text (`isStreaming={false}`) is
    parsed and committed, and starts its QuickJS worker only when the document first needs
    an expression, state, or action. Messages of plain Markdown no longer keep a QuickJS
    worker alive. Set `isStreaming` to `false` when a response ends so its parser can stop.
    Final text stays final: if the same renderer later streams more text, it shows the
    "Start a new renderer instance" error instead of continuing; render a new instance
    (for example with a new `key`) to continue a response.
  - The WebAssembly-blocked Content Security Policy error now appears only when a document
    needs the expression runtime. Check a CSP with an interactive document, not plain
    Markdown. Jobs sent while QuickJS is still starting get a longer first deadline, so a
    slow start no longer stops the document with a time-limit error.

- 25bb8fc: Support chat layouts that scroll a message list instead of the page.

  - Renderers now find the element that scrolls them: the nearest ancestor with
    `overflow-y: auto`, `scroll` or `overlay` whose content overflows by more than
    a few pixels, crossing Shadow DOM boundaries, or the window when there is
    none. The body counts when the root element clips its own overflow (app
    shells with `html { overflow: hidden }` and a scrolling body). Renderers check
    again when they resize, the window resizes, or the reader scrolls an ancestor,
    including one inside a shadow root, so a message list that starts short and
    overflows later is picked up. In such
    a list, long flows, repeated lists and repeated table rows (more than 100
    items) now mount their rows as the list scrolls in iframe, host and Shadow DOM
    modes; before, they stayed blank. `autoScroll` follows inside the list,
    `padding` uses the space below the message in the list, and `onFollowChange`
    reports `false` when the reader pauses there, so a "Jump to latest" button
    appears. Before, following did nothing in a scrolling list while still
    reporting `true`. Page-scrolled layouts behave as before.
  - New `scrollContainer` prop, in every mode: `"auto"` (default) detects the
    scroller as above, `"window"` always uses the page, and an element or a React
    ref to one names it directly; `null` and a ref that is still empty behave like
    `"auto"`. A ref is read again after the commit that mounts the renderer, so a
    pane that mounts together with it is used from the first frame, and on every
    later check, so a remounted pane is picked up. Other values throw. The `ScrollContainer` type is
    exported. Pass `"window"` if detection picks a wrapper that should not scroll.
  - Reading gestures pause following only when they happen in the renderer's
    scroller: the wheel, touch, middle-click and link presses inside it, a press
    on its own scrollbar, and scrolling keys pressed inside it or with nothing
    focused. With a scroll container, wheeling a sidebar or another pane no longer
    pauses following. With the window as scroller, every gesture on the page
    still counts.
  - After the stream ends, `autoScroll` keeps late layout such as charts in view
    only until something else scrolls the view relative to the message's end.
    An app that scrolls to an earlier row of a finished answer, for example with
    `scrollIntoView` or by setting `scrollTop`, now stays there and
    `onFollowChange` reports `false`. Before, re-measured content pulled the view
    back to the answer's end. Scroll corrections that keep the end in place, such
    as a virtualized list adjusting for measured rows, keep following. While
    streaming, only reading gestures pause following, as before.
  - While following, the renderer sets `overflow-anchor: none` on the scroller it
    follows (the scroll container's inline style, or the root element for the
    page) and restores the previous value when following pauses.
  - Progressive reveal in host and Shadow DOM modes treats the scroller's visible
    area, not the whole window, as on screen.
  - The frame runtime changed internally; its messages did not. Copy the runtime
    assets again with `npx opendil copy-assets` to silence the version warning.

- 8cc6554: Ship the agent spec with the package so prompts match the installed renderer.
  `import { agentSpec, agentSpecFull, agentSpecExamples } from "@snackbit/opendil/agent-spec"`
  returns the three Markdown documents as strings. The entry has no imports, so it
  works in Node, Next.js route handlers, and edge runtimes, and the renderer entries
  never include it. The raw files are also exported as
  `@snackbit/opendil/spec/genui.agent.md`, `@snackbit/opendil/spec/genui.agent.full.md`,
  and `@snackbit/opendil/spec/genui.examples.md`.

  The package no longer ships `runtime/vm.js` (1.4 MB), which earlier releases
  included although no renderer loaded it.

  `opendil copy-assets` changes:

  - It copies only `frame.html` and `frame.js`. `vm.js` is no longer a runtime asset.
  - `--help` and `-h` print usage and exit 0. `--out=<dir>` works like `--out <dir>`.
  - It prints the number of files, their total size, the package version, and the destination.
  - It writes `.opendil-manifest.json` into the destination. The next copy removes
    files that an earlier copy wrote and the new version no longer ships, unless
    they changed since. It never removes files the manifest does not list. Copies
    made by earlier versions have no manifest, so delete a leftover
    `public/opendil/vm.js` once by hand.

### Patch Changes

- 25bb8fc: Show chart tooltips only where they belong and keep them on the cursor.

  - Bar charts show a tooltip while the pointer is over a bar or anywhere in the column above it, and highlight that series. Gaps between bars show nothing, and bars no longer get a snap dot.
  - Pie charts show a tooltip only over a slice. The donut hole and the area outside show nothing.
  - Line and scatter charts still snap to the nearest data point. Only the snapped dot is shown; the stale Recharts active dots that could linger, for example after entering from the right edge, are gone.
  - When a tooltip lists several series, the hovered series is bold. `ChartTooltipContent` accepts an optional `emphasizedKey` that marks the matching row with `data-emphasized="true"`.
  - The stock Recharts tooltip, its category band, and its active dots appear only while the chart has keyboard focus, for arrow-key navigation. Mouse hover shows exactly one tooltip, which no longer lags or flies in.
  - Hidden series in the legend are dimmed without a strikethrough.

- 0ffe407: Fix host and Shadow DOM rendering inside chat layouts, dark appearance, and strict Content Security Policies.

  - The `.dil-scope` root (renderers and `UiScope`) is now `position: relative`, at base-layer
    priority so position utilities passed through `className` still apply. Screen-reader
    status regions no longer escape a scrolling message list, so the page no longer grows
    taller than the viewport and `autoScroll` no longer scrolls the application shell. The
    renderer now paints in the positioned layer: app chrome that overlaps the message list,
    such as a sticky header without a `z-index`, needs its own `z-index` to stay on top.
  - `color-scheme` now follows `appearance` in every mode, and `UiScope` sets it from its
    `appearance` prop (default `light`). Shadow DOM renderers no longer force
    `color-scheme: light`. If you theme `UiScope` only through `tokens`, pass `appearance`
    too, or set `color-scheme` on it yourself.
  - Buttons, inputs, selects and text areas inside the renderer inherit the renderer
    foreground and have a transparent background unless a component sets one. Ghost
    and outline buttons (for example chart legend entries and code block actions),
    toggles, inputs and text areas set an explicit foreground, so they stay readable
    in dark appearance. Clickable boxes no longer show the browser's gray button
    background.
  - Stock `dark:` styles follow the renderer's `appearance` instead of the operating
    system's color preference. If you compile `@snackbit/opendil/tailwind.css`, it
    defines a `dil-dark` variant for this and leaves your own `dark` variant unchanged.
  - Chart series colors are set as inline custom properties instead of a `<style>`
    element, so charts need no `style-src 'unsafe-inline'`.
  - When the page's Content Security Policy blocks the parser or expression workers
    in `mode="host"` or `mode="shadow"`, readers see "This content can't be displayed
    because this page's security policy blocks it." instead of "The document parser
    stopped. Remount the renderer to try again." When it blocks WebAssembly, readers
    see "Interactive parts of this content can't run because this page's security
    policy blocks them." Each case also logs one `console.error` per page that names
    the required directives: `worker-src blob:` and `script-src 'wasm-unsafe-eval'`.
    Inside the isolated frame, the message instead says that the application's policy
    header must not be applied to the OpenDIL runtime files.
  - Pages that enforce Trusted Types (`require-trusted-types-for 'script'`) can run host
    and Shadow DOM renderers: worker URLs are created through a Trusted Types policy named
    `opendil`. If the page's `trusted-types` directive lists allowed policy names, add
    `opendil`; otherwise readers see the policy message above and the console names the
    missing policy. Other worker construction errors are logged with the original error.

- 25bb8fc: Keep Markdown lists, status badges and popover text readable in every page and appearance.

  - Markdown lists keep their bullets, numbers and indentation, and block quotes
    their indentation, in host mode on pages with a CSS reset such as Tailwind's
    preflight. The renderer's styles now set them, with the same values browsers
    use by default, so iframe and Shadow DOM rendering look as before.
  - Badges and text with `color="success"`, `"warning"` or `"danger"` follow the
    renderer's appearance: dark appearance uses dark tinted badge backgrounds and
    lighter status text instead of light pastel fills. The colors come from the
    new tokens `--dil-success-surface`, `--dil-warning-surface` and
    `--dil-danger-surface` and the existing `--dil-success` and `--dil-warning`,
    which `tokens` can override.
  - Consecutive children of `<popover-content>`, such as several `<text>`
    elements, stack as separate lines with the usual spacing instead of running
    together on one line.

- 25bb8fc: `progressiveReveal` now animates in host and Shadow DOM modes under React
  `StrictMode` and when React replays effects, for example when an `<Activity>`
  shows its content again. Before, the replayed effects marked every block as
  already shown, so nothing faded in. Blocks that finished revealing still do not
  animate again.
