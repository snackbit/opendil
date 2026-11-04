# OpenDIL chat with Next.js and the AI SDK

A streaming chat built with the Next.js App Router and the [Vercel AI SDK](https://ai-sdk.dev/). The route puts the OpenDIL agent spec in the system prompt, and the browser renders each assistant answer with `DilRenderer` in the default iframe mode, interactive while it streams.

It is the code from [Add OpenDIL to your chat app](https://opendil.com/docs/chat-integration/) (AI SDK and Next.js tabs) in a runnable app.

## Run it

Node.js 24 or later:

```bash
npm install
cp .env.example .env.local   # then set OPENAI_API_KEY
npm run dev
```

Open http://localhost:3000 and ask for something visual, such as "a pricing calculator for 5 to 50 seats".

`npm install` also runs `opendil copy-assets` (the `postinstall` script), which copies the iframe runtime into `public/opendil/`. Run `npm run build` and `npm start` for a production build, and `npm run typecheck` to check the types.

## Where to look

| File                                             | What it does                                                                               |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| [`app/api/chat/route.ts`](app/api/chat/route.ts) | Streams the model's answer with `streamText`, with `agentSpec` as the instructions.        |
| [`components/chat.tsx`](components/chat.tsx)     | `useChat` message list with Stop, Retry, and a truncation notice.                          |
| [`components/answer.tsx`](components/answer.tsx) | One `DilRenderer` per answer: `isStreaming`, follow the newest answer, `onError`, theming. |
| [`components/chat.css`](components/chat.css)     | The scrolling message list the renderer follows.                                           |
| [`next.config.ts`](next.config.ts)               | Sends the security header for `/opendil/frame.html`.                                       |

`LLM_MODEL` picks the OpenAI model. To use another provider, swap `openai(…)` in the route for any AI SDK provider.

## Learn more

- [Quickstart](https://opendil.com/docs/getting-started/)
- [Add OpenDIL to your chat app](https://opendil.com/docs/chat-integration/)
- [Rendering modes](https://opendil.com/docs/rendering-modes/)
- [Troubleshooting](https://opendil.com/docs/troubleshooting/)
