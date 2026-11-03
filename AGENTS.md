# Working in OpenDIL

- `packages/opendil`: public React API, parser, runtime, stock widgets, scoped styles, and asset build.
- `apps/demo`: Astro site, Starlight docs, and React workbench consuming package exports. `DESIGN.md` defines the site shell; generated interfaces keep their own theme. The shared example catalog supplies playground and docs source. `tests/unit` and `tests/e2e` own regression coverage.
- `DIL-SPEC.md` is the language/runtime reference; `spec/genui.agent.md` is guidance for authoring DIL, not repository instructions.

Use Node 24 and npm workspaces. Run `npm ci`, then `npm run build`. Before handing off, run `npm run check`, `npm run test:e2e`, and `npm run check:package`. Time costly checks; use focused tests while iterating.

For build-system changes, also run `npm run check:rebuild` to verify that live Vite imports remain available during output publication.

Keep the default opaque-origin frame and bounded QuickJS execution intact. Host and Shadow DOM customization are explicitly opt-in; Shadow DOM is a styling boundary, not iframe containment. Validate channel data and custom-component input at their boundaries. Do not evaluate document expressions in browser JavaScript. The demo tokenizer belongs to its own worker and must not become a renderer dependency.

Import other workspaces through package exports. Keep React peer dependencies external. Update consumers, types, tests, and existing docs together. Use apply_patch for semantic changes; format each coherent batch and inspect its diff.

Keep implementation files below 600 lines and source directories below 15 direct source files. Split by responsibility. Do not create catch-all helpers or duplicate documentation.

Generated runtime assets, dist, coverage, and test reports are ignored. Use `.tmp/` for disposable repository scratch, clean task-owned artifacts, and preserve unfamiliar user files. Raw research captures stay local and must not enter published artifacts.

Default to the main thread; delegate only when the operator requests it. Do not commit, push, publish, or deploy unless requested.
