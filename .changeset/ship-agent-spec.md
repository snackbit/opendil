---
"@snackbit/opendil": minor
---

Ship the agent spec with the package so prompts match the installed renderer.
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
