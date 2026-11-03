# OpenDIL

**Dynamic Interface Language for streaming, interactive documents in React.**

OpenDIL turns a growing text response into a working interface. Markdown, charts, controls, diagrams, and small pieces of state can share one document. Readers can use the content that has arrived while the rest is still streaming.

[Website](https://opendil.com/) · [Interactive demo](https://opendil.com/demo/) · [Documentation](https://opendil.com/docs/getting-started/) · [Agent Spec](https://opendil.com/agent-spec/)

![A chart arriving while earlier controls remain usable](https://raw.githubusercontent.com/snackbit/opendil/main/docs/dil-assets/streaming-chart.png)

## Where this came from

OpenDIL grew out of experiments with ChatGPT’s generative UI. We wanted to use the same idea in our own applications: a text response that becomes an interface as it arrives. This is an independent project with its own documented dialect.

## Install

```sh
npm install @snackbit/opendil react react-dom
# Required only for iframe mode (the default):
npx opendil copy-assets --out public/opendil
```

Iframe mode loads its stock runtime from `/opendil/frame.html`. Serve the copied assets with your application, set `runtimeBaseUrl` when hosting under another path, and refresh the assets when upgrading the package. Host and Shadow DOM modes bundle their runtime and workers with your application and do not require `copy-assets`.

```tsx
import { DilRenderer } from "@snackbit/opendil";
import "@snackbit/opendil/styles.css";

export function Answer({
  text,
  streaming,
}: {
  text: string;
  streaming: boolean;
}) {
  return <DilRenderer text={text} isStreaming={streaming} />;
}
```

Pass the entire source prefix received so far. Append to it as chunks arrive, then set `isStreaming={false}`. Give the renderer a new React `key` to replace or restart a document.

Set `showStatus={false}` to omit the receiving/completion label. Errors and clipboard feedback remain visible. Website previews use this setting in all rendering modes.

Use `progressiveReveal` to fade new blocks in sequence. It defaults to `false`; `true` uses a 50 ms stagger and 180 ms fade. Set your own timing with `progressiveReveal={{ staggerMs: 80, durationMs: 240 }}`. Reduced motion disables the animation, and existing content keeps its state.

Content grows as it arrives. Incomplete syntax does not add guessed-size skeletons, and controls keep the same shell while becoming ready. Text reflow and real content changes can still resize a card; the renderer does not lock its height.

Use `updateInterval={200}` to coalesce streaming presentation updates to at most once every 200 ms. The default is `"instant"`. This limits update frequency during a continuous stream rather than waiting for it to stop. Native edits and user-action feedback stay responsive.

Enable `autoScroll` to follow a streaming message. Any scroll-wheel gesture, touch scroll, scrollbar drag, or page-scroll key pauses following immediately. It stays paused until you call `resumeAutoScroll()` through the renderer ref. `onFollowChange` reports that state so your application can offer a “Jump to latest” control. The demo includes this control and settings for playback and reveal timing.

Following stays engaged after source completion to catch late layout updates, without running animation frames while settled. When rendering multiple messages, enable it only on the active or latest renderer.

For smooth following with space below the message, pass `autoScroll={{ behavior: "smooth", padding: 32 }}`. Defaults are `"instant"` and `0`. Smooth following tracks a moving destination with one animation loop, including the final rendered tail. Padding uses available page space; it does not add blank content. Reduced motion uses instant scrolling.

The package targets React 19 and modern browsers with workers, WebAssembly, and iframe sandbox support. The asset CLI requires Node 22 or newer.

## What a document can do

```text
# Choose a quantity
{@body const [quantity, setQuantity] = DIL.useState(1)}
<slider value={quantity} min={1} max={10}
        onChange={value => setQuantity(value)} aria-label="Quantity" />
<text>Quantity: {quantity}</text>
```

The renderer supports incremental Markdown, reactive state and expressions, conditional and repeated content, form controls, tables, charts, SVG, React Flow graphs, and Mermaid diagrams. Large flows and repeated lists use virtualization, including preservation of active inputs. Parsing and expression work run in workers.

It is a bounded document language. It does not compile arbitrary JSX or TypeScript, and the stock renderer does not provide maps, live weather, product search, or file exports. Stock image examples are offline illustrations; a host component can connect an image service.

Multi-series line and bar charts use Grafana-style legend controls: click to isolate, click again to restore, and Ctrl/Cmd-click to toggle individual series. Donut legends identify categories without changing their proportions. Hovering highlights the corresponding series or slice; scatter tooltips snap to nearby points.

Code blocks highlight their declared language in both editable and read-only views. Wrapping, selection, scrolling, and copy use the same source text. Unknown languages and oversized highlighting workloads fall back to plain text. Theme tokens `--dil-code-keyword`, `--dil-code-string`, `--dil-code-number`, and `--dil-code-title` override syntax colors.

## Isolation and customization

The default mode renders stock components in an opaque-origin iframe. Expressions execute in a separate QuickJS worker with memory and execution limits. The frame denies network connections and uses a restrictive content security policy. Custom React components require a custom isolated runtime build or fork.

| Mode                   | Rendering boundary                              | Custom React components         |
| ---------------------- | ----------------------------------------------- | ------------------------------- |
| `"isolated"` (default) | Sandboxed iframe with restricted network access | Requires a custom runtime build |
| `"shadow"`             | Shadow DOM for markup and styles                | Supported                       |
| `"host"`               | Renderer-scoped styles in the page DOM          | Supported                       |

Every mode keeps DIL expressions in bounded QuickJS workers. Shadow DOM shares the page's JavaScript privileges and does not provide the iframe's security boundary.

Choose `mode="host"` to use your own React components and styling:

```tsx
import { DilRenderer, type DilComponentProps } from "@snackbit/opendil";
import "@snackbit/opendil/styles.css";

function Callout({
  children,
  className,
  config,
  presentationRef,
}: DilComponentProps) {
  return (
    <aside ref={presentationRef} className={className}>
      <strong>{String(config.label ?? "Note")}</strong>
      {children}
    </aside>
  );
}

const components = { Callout };

export function Preview() {
  return (
    <DilRenderer
      mode="host"
      text="<Callout>Your application owns this component.</Callout>"
      components={components}
      componentConfig={{ Callout: { label: "From our design system" } }}
      classNames={{ Callout: "rounded-xl border p-4" }}
      tokens={{ "--primary": "#156f55", "--radius": "1rem" }}
    />
  );
}
```

Register a stock tag such as `button` to replace it, or add a name such as `Callout`. Components receive evaluated `attributes`, `children`, `config`, `className`, named `slots`, a `ready` flag, and `invoke(attribute, value)` for DIL callbacks. Treat attributes as document input and validate the values your component accepts. Do not spread them onto DOM elements.

Forward `presentationRef` to your component's visual root to include it in progressive reveal. Leave it off layout wrappers whose children should reveal independently.

Host mode keeps expression workers, but its React components run with your application's privileges. Use it with trusted documents and trusted component code. It does not provide the iframe's containment.

The same customization API works with `mode="shadow"`. Its stock stylesheet is installed automatically; use `shadowStyles` for application CSS or compiled Tailwind utilities that should apply inside the shadow tree. Styles imported into the surrounding page do not reach those components. Shadow mode requires support for constructed stylesheets and `adoptedStyleSheets`.

Use `appearance="dark"`, root `className`, CSS variables through `tokens`, or per-component `classNames`. Defaults merge before caller classes. Compound custom components can accept named `slots`; they own forwarding those classes to their parts.

For stock components, `componentConfig` supplies default attributes; document attributes take precedence. Class overrides apply to the layout, text, badge, and control adapters. Replace other adapters with a registered component when you need full control over their markup.

For a Tailwind v4 build, import `@snackbit/opendil/tailwind.css` instead of the compiled CSS and include your application's source in Tailwind's scan. The supplied CSS is scoped to `.dil-scope` and omits a global reset. Apply custom styles inside that scope. The demo shows a working theme and component replacement.

## Large documents

The benchmark fixture contains 5,000 cards in roughly 2.4 MB of DIL. Virtualization keeps the mounted interface small while workers handle parsing and expressions. Run `npm run capture` for benchmark output and screenshots.

## Development

The demo replays OpenAI-compatible `o200k_base` tokens at 1–1000 tokens/sec, defaulting to 150. Auto-scroll starts enabled; demo reveal timing starts at a 100 ms step delay and 220 ms fade. Its settings include an exact rate input, logarithmic slider, renderer mode, reveal timing, scroll behavior, and scroll-ahead padding. Tokenization runs in a demo worker and is not a renderer dependency. Character-based stress workloads remain separate and explicitly labelled in benchmark mode.

```sh
npm ci
npm run build
npm run check
npx playwright install chromium
npm run test:e2e
npm run check:package
```

`npm run dev` builds the package and starts the Astro site on port 5173. The site includes a landing page, an editable source/render workbench, and searchable Starlight documentation. Examples share one catalog, and custom drafts stay in session storage. The monorepo contains the publishable renderer in `packages/opendil`, the site in `apps/demo`, and shared lint and TypeScript settings in private packages.

Website demos and embedded documentation examples use Shadow DOM by default. The workbench settings also offer host and iframe rendering. The public `DilRenderer` component still defaults to iframe isolation.

See [Contributing](https://github.com/snackbit/opendil/blob/main/CONTRIBUTING.md) for changes and releases, and [Security](https://github.com/snackbit/opendil/blob/main/SECURITY.md) for reporting vulnerabilities.

## License

Apache 2.0. See [LICENSE](https://github.com/snackbit/opendil/blob/main/LICENSE) and [third-party notices](https://github.com/snackbit/opendil/blob/main/THIRD_PARTY_NOTICES.md).
