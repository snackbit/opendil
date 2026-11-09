/**
 * `@snackbit/opendil/lib`: the UI components, `MarkdownRenderer`, copy and
 * export helpers, text extraction, and the agent spec strings. Importing it
 * reads no `window` or `document`, so it also loads in Node and server
 * rendering.
 *
 * The build writes this entry as named re-exports of one module per area, so
 * bundlers keep only the areas an app uses. The React areas (ui, markdown,
 * serialize) build with the renderer entry and share its module state, such
 * as contexts and the chart copy registry, and carry a client directive. The
 * others (text, export, agent-spec) have no React and no directive, so
 * servers and React Server Components can call them.
 */
export * from "./entries/ui";
export * from "./entries/markdown";
export * from "./entries/serialize";
export * from "./entries/text";
export * from "./entries/export";
export * from "./entries/agent-spec";
