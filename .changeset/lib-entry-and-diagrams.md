---
"@snackbit/opendil": minor
---

One `@snackbit/opendil/lib` entry, diagram hooks, and steadier layout:

- **Breaking:** `@snackbit/opendil/ui` and `@snackbit/opendil/agent-spec` are replaced by `@snackbit/opendil/lib`, which also exports `MarkdownRenderer`, `serializeRenderedDocument`, `literalMarkdown`, `extractDilText`, `exportSvg`, and `rasterizeSvg`. The package exports `.`, `./lib`, `./styles.css`, `./tailwind.css`, `./testing`, `./package.json`, and the three spec files. `./lib` imports in Node and server rendering without a DOM, its React half carries `"use client"` and the rest does not, and bundlers remove its unused exports. Change `from "@snackbit/opendil/ui"` and `from "@snackbit/opendil/agent-spec"` to `from "@snackbit/opendil/lib"`.
- `onOpenDiagram` (host and Shadow DOM modes, and `MarkdownRenderer`) adds an "Open diagram" button to Mermaid diagrams and hands your function the sanitized standalone SVG, the source, the accessible title, and the natural size. `exportSvg()` and `rasterizeSvg()` turn it into SVG and PNG files (1x, 2x, or 4x, transparent or white), with stable `DilExportError` codes.
- The `CodeBlock` editor's textarea and highlight layer share one set of metrics, from the code tokens and the new `--dil-code-tab-size`, even when page CSS reaches the textarea, and the editor is as tall as its code.
- Pending `NodeGraph`, `Chart`, and `Mermaid` parts reserve their height, so text below them does not move when they arrive.
- The node graph no longer captures the mouse wheel: it zooms on wheel only while focused or with Cmd/Ctrl held.
- A host or Shadow DOM renderer that mounted while its code was loading no longer remounts the answer on a later render, and customization props are compared by content, so inline objects no longer re-render every widget.
- Mermaid output loses `@import`, `@font-face`, `image-set()`, `image()`, `cross-fade()`, `src()`, and remote `url()` references, and inline SVG attributes refuse them, so answers fetch nothing.
- The document root carries `data-dil-document` (`"dil"` or `"markdown"`).
- Progressive reveal shows content at once in DOMs without the Web Animations API, such as jsdom, instead of throwing from an animation frame.
