# OpenDIL chat with Vite and server-sent events

A streaming chat built with Vite and React, without an AI SDK. A small [Hono](https://hono.dev/) server calls any OpenAI-compatible Chat Completions endpoint with `fetch`, puts the OpenDIL agent spec in the system prompt, and streams the answer to the browser as server-sent events. The browser reads the stream with a small hook and renders each assistant answer with `DilRenderer` in the default iframe mode.

It is the code from [Add OpenDIL to your chat app](https://opendil.com/docs/chat-integration/) (fetch and Vite tabs) in a runnable app.

## Run it

Node.js 24 or later, which runs the TypeScript server directly:

```bash
npm install
cp .env.example .env   # then set LLM_API_KEY
npm run server         # API server on http://localhost:8787
npm run dev            # in a second terminal
```

Open http://localhost:5173 and ask for something visual, such as "a pricing calculator for 5 to 50 seats". Vite forwards `/api` to the API server.

`npm install` also runs `opendil copy-assets` (the `postinstall` script), which copies the iframe runtime into `public/opendil/`. `npm run build` writes the static app to `dist/`, and `npm run preview` serves it with the same `/api` proxy. In production, route `/api` to the API server from your host or reverse proxy, and send the frame header from your web server.

## Where to look

| File                                                                     | What it does                                                                               |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| [`server/chat.ts`](server/chat.ts)                                       | Calls the model with `fetch` and forwards `text`, `finish`, and `error` events.            |
| [`server/index.ts`](server/index.ts)                                     | Serves the route at `POST /api/chat`.                                                      |
| [`src/components/use-chat-stream.ts`](src/components/use-chat-stream.ts) | Sends the conversation and reads the event stream, with stop and retry.                    |
| [`src/components/answer.tsx`](src/components/answer.tsx)                 | One `DilRenderer` per answer: `isStreaming`, follow the newest answer, `onError`, theming. |
| [`src/components/chat.tsx`](src/components/chat.tsx)                     | The message list, input, and Stop and Retry buttons.                                       |
| [`vite.config.ts`](vite.config.ts)                                       | Sends the security header for `/opendil/frame.html` and proxies `/api`.                    |

Set `LLM_BASE_URL` and `LLM_MODEL` to use another OpenAI-compatible provider.

## Learn more

- [Quickstart](https://opendil.com/docs/getting-started/)
- [Add OpenDIL to your chat app](https://opendil.com/docs/chat-integration/)
- [Rendering modes](https://opendil.com/docs/rendering-modes/)
- [Troubleshooting](https://opendil.com/docs/troubleshooting/)
