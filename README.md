<div align="center">

# OpenDIL

**Interactive interfaces that stream in with your model's answer.**

[![npm](https://img.shields.io/npm/v/@snackbit/opendil?color=5e4cff&label=npm)](https://www.npmjs.com/package/@snackbit/opendil)
[![CI](https://github.com/snackbit/opendil/actions/workflows/ci.yml/badge.svg)](https://github.com/snackbit/opendil/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-5e4cff)](https://github.com/snackbit/opendil/blob/main/LICENSE)

[Docs](https://opendil.com/docs/) · [Quickstart](https://opendil.com/docs/getting-started/) · [Playground](https://opendil.com/demo/) · [Agent spec](https://opendil.com/docs/agent-spec/)

<img src="https://raw.githubusercontent.com/snackbit/opendil/main/docs/dil-assets/streaming-demo.gif" width="880" alt="DIL source streams in on the left while a budget planner builds up on the right. After the stream ends, the team slider moves from 8 to 18, annual billing is switched on, and the total and chart update." />

</div>

OpenDIL is a React renderer for DIL (Dynamic Interface Language): Markdown mixed with component tags, a little state, and expressions. A model writes DIL as plain text, your app passes along what has arrived so far, and readers can use the sliders, charts, and buttons before the answer finishes.

OpenDIL never calls your model provider. It works with any client that streams text, including the Vercel AI SDK, the OpenAI and Anthropic SDKs, and plain `fetch`.

## Quickstart

Install the package and copy the iframe runtime into your public folder:

```sh
npm install @snackbit/opendil
npx opendil copy-assets --out public/opendil
```

The default rendering mode draws each answer in a sandboxed iframe that loads `frame.html` and `frame.js` from `/opendil/`. Copy them again on every install (a `postinstall` script works), and serve `frame.html` with the header described in the [Quickstart](https://opendil.com/docs/getting-started/#send-the-frames-security-header) before you ship.

Put the agent spec first in your system prompt:

```ts
import { agentSpec } from "@snackbit/opendil/lib";

export const systemPrompt = [
  agentSpec,
  "You are the assistant in a pricing app. Keep answers short.",
].join("\n\n");
```

Render each assistant message with `DilRenderer`:

```tsx
"use client";
import { DilRenderer } from "@snackbit/opendil";
import "@snackbit/opendil/styles.css";

type Message = { id: string; role: "user" | "assistant"; text: string };

export function Messages(props: { messages: Message[]; streaming: boolean }) {
  const { messages, streaming } = props;
  return messages.map((message, index) =>
    message.role === "user" ? (
      <p key={message.id}>{message.text}</p>
    ) : (
      <DilRenderer
        key={message.id}
        text={message.text}
        isStreaming={streaming && index === messages.length - 1}
        showStatus={false}
      />
    ),
  );
}
```

Three rules apply to every streamed answer:

1. Pass all the text received so far. `text` only grows.
2. Set `isStreaming={false}` when the answer is complete.
3. Give each answer its own `key`. A new key starts a new answer.

## Integrating OpenDIL

An integration has two halves, one on each side of your existing chat.

**Teach the model DIL.** The agent spec is a Markdown document that teaches a model the syntax, the stock components, and the output rules. It ships in the package, so the prompt always matches your renderer version. `@snackbit/opendil/lib` exports three strings: `agentSpec` (the primary spec, about 23 KB), `agentSpecFull` (about 83 KB, with a block per component and task), and `agentSpecExamples` (a runnable example per component). The same files are exported as Markdown under `@snackbit/opendil/spec/`, and the source lives in [`spec/`](https://github.com/snackbit/opendil/tree/main/spec).

- [Agent spec](https://opendil.com/docs/agent-spec/): load the spec, choose primary or full, and add your own rules.
- [Prompting and evaluation](https://opendil.com/docs/prompting/): decide when the model should use UI, supply data, and test generated answers.

**Render the stream in React.** `DilRenderer` takes the text received so far and whether more may arrive. Your app keeps its transport, message storage, and chat interface.

- [Add OpenDIL to your chat app](https://opendil.com/docs/chat-integration/): server routes and client code for the AI SDK, OpenAI, Anthropic, and `fetch` with server-sent events, including stop, retry, and "Jump to latest".
- [Streaming](https://opendil.com/docs/streaming/): fade in new content, follow the stream, and control update frequency.
- [`DilRenderer` reference](https://opendil.com/docs/renderer/): every prop, the ref handle, and the types.

Two example apps show a complete integration:

- [`examples/next-ai-sdk`](https://github.com/snackbit/opendil/tree/main/examples/next-ai-sdk): Next.js with the Vercel AI SDK.
- [`examples/vite-sse`](https://github.com/snackbit/opendil/tree/main/examples/vite-sse): Vite with a server that streams server-sent events.

## What DIL looks like

```jsx
{@body const [count,setCount] = DIL.useState(0)}
<box border padding={4} gap={3}>
  <title>Hello from DIL</title>
  <button onClick={() => setCount(count + 1)}>Clicked {count} times</button>
</box>
```

Markdown carries the prose. Tags such as `<box>`, `<slider>`, and `<Chart>` become components, `{@body …}` declares state and derived values, and `{#if}` and `{#each}` show content conditionally or repeat it. The [DIL tour](https://opendil.com/docs/language/) covers the language, and the [component pages](https://opendil.com/docs/components/text/) list every stock component.

## Rendering modes

| Mode                 | Where it renders                        | Custom components | Setup                                 |
| -------------------- | --------------------------------------- | ----------------- | ------------------------------------- |
| `isolated` (default) | A sandboxed iframe with no origin       | No                | Runtime files and one response header |
| `shadow`             | A shadow root in your page              | Yes               | Two CSP directives, if you send a CSP |
| `host`               | Your page's DOM, in a `.dil-scope` root | Yes               | Two CSP directives, if you send a CSP |

Start with the default. Switch to Shadow DOM or host mode when you need [custom components](https://opendil.com/docs/custom-components/) or your own classes on built-in ones. [Rendering modes](https://opendil.com/docs/rendering-modes/) covers headers, base paths, and Content Security Policy for each mode, and [Theming](https://opendil.com/docs/theming/) covers light and dark appearance and design tokens.

## Security

OpenDIL treats every answer as untrusted input. In every mode, expressions run in QuickJS, a JavaScript engine compiled to WebAssembly, inside a Web Worker with memory and work limits; your page never evaluates them. The default iframe mode also keeps the answer away from your page, its storage, and the network, while Shadow DOM and host modes render in your page's origin and are a styling boundary, not a security boundary. [Security](https://opendil.com/docs/security/) describes the threat model and what you must configure. Report vulnerabilities as described in [SECURITY.md](https://github.com/snackbit/opendil/blob/main/SECURITY.md).

## Requirements

- React 19. `react` and `react-dom` `^19.0.0` are peer dependencies.
- A bundler that reads package `exports` and CSS imports, such as Next.js or Vite. The package is ESM only.
- A browser with Web Workers, WebAssembly, and sandboxed iframes. Shadow DOM mode also needs constructable stylesheets.
- Node.js 22 or newer for the `opendil` command.

[Package and CLI](https://opendil.com/docs/package/) lists the entry points, stylesheets, and bundle sizes. [Limits](https://opendil.com/docs/limits/) lists what DIL and the stock renderer do not do.

## Contributing

See [CONTRIBUTING.md](https://github.com/snackbit/opendil/blob/main/CONTRIBUTING.md) for the repository layout, checks, and release process.

## License

Apache 2.0. See [LICENSE](https://github.com/snackbit/opendil/blob/main/LICENSE) and the [third-party notices](https://github.com/snackbit/opendil/blob/main/THIRD_PARTY_NOTICES.md).

Made by [Felix Faust](https://turtledev.net).
