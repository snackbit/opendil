# Working in OpenDIL

- `packages/opendil`: public React API, parser, runtime, stock widgets, scoped styles, and asset build.
- `apps/site`: Next.js and Fumadocs site with the landing page, docs (`apps/site/content/docs`), and the playground, consuming package exports. `DESIGN.md` defines the site shell; generated interfaces keep their own theme. The shared example catalog supplies playground and docs source.
- `examples/`: standalone Next.js (AI SDK) and Vite (SSE) chat apps that install the published package; `npm run check:examples` builds them against the local package.
- `tests/unit` and `tests/e2e` own regression coverage.
- `spec/genui.agent.md` (shipped as a package export) is guidance for models authoring DIL, not repository instructions. The docs language pages are the reference for people.

Use Node 24 and npm workspaces. Run `npm ci`, then `npm run build`; `npm run dev` serves the site. Before handing off, run `npm run check`, `npm run test:e2e`, and `npm run check:package`; after docs changes also `npm run check:links`, and after package API changes `npm run check:examples`. Time costly checks; use focused tests while iterating.

For build-system changes, also run `npm run check:rebuild` to verify that the site's dev server keeps serving while the package output republishes.

Keep the default opaque-origin frame and bounded QuickJS execution intact. Host and Shadow DOM customization are explicitly opt-in; Shadow DOM is a styling boundary, not iframe containment. Validate channel data and custom-component input at their boundaries. Do not evaluate document expressions in browser JavaScript. The site's tokenizer belongs to its own worker and must not become a renderer dependency.

Import other workspaces through package exports. Keep React peer dependencies external. Update consumers, types, tests, and existing docs together. Use apply_patch for semantic changes; format each coherent batch and inspect its diff.

Keep implementation files below 600 lines and source directories below 15 direct source files. Split by responsibility. Do not create catch-all helpers or duplicate documentation.

Generated runtime assets, dist, coverage, and test reports are ignored. Use `.tmp/` for disposable repository scratch, clean task-owned artifacts, and preserve unfamiliar user files. Raw research captures stay local and must not enter published artifacts.

Default to the main thread; delegate only when the operator requests it. Do not commit, push, publish, or deploy unless requested.
