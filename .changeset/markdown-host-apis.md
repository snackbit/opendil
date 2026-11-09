---
"@snackbit/opendil": minor
---

Add host APIs for embedding OpenDIL in applications that own their design system:

- `markdownComponents` (host and Shadow DOM modes) renders Markdown links, images, code, headings, blockquotes, and tables with your components. Defaults are unchanged: links stay inert and images hidden.
- `MarkdownRenderer` renders Markdown only, with no parser or expression worker.
- The `<Markdown>` stock component shows its raw body as Markdown only. `literalMarkdown()` builds one with the closing-tag escape.
- `diagnostics` controls console warnings and lets a `Problem` component replace the generic error wording. Every `DilRenderError` now has a stable `code`; errors from older iframe runtimes arrive as `unclassified`.
- `theme="inherit"` lets the host page's color, radius, and font variables reach the answer.
- `extractDilText()` reads an answer's text and host component references without running it.
- `@snackbit/opendil/testing` exports `installInlineWorkers()` for jsdom and happy-dom tests.
- JSON literal expressions such as `{"Total"}` and `{3}` are read without starting QuickJS.
- Replacing `text` with different content of the same or greater length now reports a `source-replaced` error instead of corrupting the document. Headings `h4` to `h6` now substitute expressions.
