---
"@snackbit/opendil": minor
---

Add APIs for hosts that render answers with their own design system and copy them as shown:

- `uiPrimitives` (host and Shadow DOM modes) replaces the buttons, checkboxes, inputs, sliders, radio and toggle groups, popovers, and tooltips inside stock widgets with your components. Overlays receive a `portalContainer` inside the renderer's scope.
- `DilRendererHandle.serialize()`, a `MarkdownRenderer` ref, and `serializeRenderedDocument()` return what an answer shows as sanitized HTML and Markdown, with widgets in their current state. Blocks that are still fading in with progressive reveal are included. Iframe mode returns `null`.
- Text that is complete when a host or Shadow DOM renderer mounts, up to 1 MiB, is parsed in the first render, so the first commit and server rendering show it.
- `MarkdownRenderer` accepts `inline` to render phrasing content inside spans; the line breaks between blocks stay in the text, so `white-space: pre-wrap` keeps paragraphs apart. It also accepts `uiPrimitives`.
- `markdownComponents.urlTransform` sets which link and image URLs reach your overrides; the default policy is unchanged.
- Charts read `--dil-chart-1` to `--dil-chart-8` before `--chart-*`, so palettes of up to eight colors map one to one, and accept `title`, `description`, `xLabel`, and `yLabel`. Copies of the answer show a chart as its title, description, and data table.
- New layout and typography tokens (`--dil-font-size`, `--dil-font-mono`, `--dil-item-gap`, heading, list, quote, table, and code tokens) can be set on any ancestor. Segmented controls are styled through stock classes instead of `data-slot`, so injected controls keep their styles.
- The clipboard announcement region renders only when the answer has an action control or a clipboard outcome.
- Markdown fences render in the `CodeBlock` frame, with highlighting, a language label, word wrap, and copy. `markdownComponents.code` overrides still win, and their `Default` includes the frame. `--dil-code-border`, `--dil-code-font-size`, and `--dil-code-line-height` join the code tokens, which now style fences and `CodeBlock` alike. Copying code past the 65,536-character limit says so instead of pointing at clipboard permissions.
- A Mermaid diagram that is too large, uses an unsupported feature, has too many edges, or does not parse now says which, and shows its source with copy instead of a diagram.
