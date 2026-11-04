---
"@snackbit/opendil": patch
---

Fix host and Shadow DOM rendering inside chat layouts, dark appearance, and strict Content Security Policies.

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
