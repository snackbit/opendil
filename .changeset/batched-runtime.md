---
"@snackbit/opendil": minor
---

Make documents settle and respond faster:

- Expressions evaluate in batches: a document's declarations and evaluations reach QuickJS in one message, and an action's reply carries every result it changed. Results reach the screen together, once per animation frame, and reader actions in the next commit. A result that did not change keeps its value, so nothing renders again. `updateInterval` still limits how often streamed updates appear.
- `progressiveReveal` fades in only text that arrives while the renderer streams. Finished answers, history, and the text a stream had when its renderer mounted appear at once, without the controller measuring or touching them. Ending the stream shows queued and fading blocks at once.
- `onSettled` (host and Shadow DOM modes) and the `data-dil-settled` attribute report when a finished answer has the final layout readers can see. A chart, graph or diagram outside the visible area keeps its reserved height while it loads and does not delay it; `onSnapshot` then reports again with its height once it has laid out.
- `preloadHostRenderer()` returns the same promise on every call and starts an expression runtime ahead of the first answer. Later runtimes reuse the compiled WebAssembly module, and an effect React replays under StrictMode keeps the document and runtime it already has.
- A flow short enough to render every child no longer measures itself on scroll.
- `cacheKey` (host and Shadow DOM modes) keeps up to 12 unmounted finished answers alive, so a renderer that mounts again with the same key and text shows its final layout in the first commit, without worker work. A streamed answer that receives its key when it finishes is kept too. `clearDocumentCache()` drops the kept answers, for example at sign-out or between test cases. `onSnapshot` and `snapshot` carry an answer's results and widget heights across reloads as JSON; the runtime confirms them in the background.
- Text a streaming renderer has at mount, up to 1 MiB, and the rest of that stream parse in the page, so a renderer mounted mid-answer shows its prefix in the first commit. Mermaid diagrams lay out in an idle callback.
- A finished answer that has not settled before keeps the height of its first frame (`data-dil-held`) until it settles, so the page around it moves once. Snapshot widget heights are kept per renderer width (`DilSnapshot` version 2), so a narrow and a wide view each reserve their own. Charts and graphs that receive their values after an answer's first commit, or whose height a snapshot recorded, mount one per task.
- An empty answer mounted before its stream starts streams into a new document, so its text reveals instead of failing as a restart.
