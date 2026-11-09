import { agentSpec } from "@snackbit/opendil/lib";
import { readChatRequest } from "./request.ts";

// Any provider with an OpenAI-compatible Chat Completions endpoint works.
const baseUrl = process.env.LLM_BASE_URL ?? "https://api.openai.com/v1";
const encoder = new TextEncoder();

export async function POST(req: Request) {
  const messages = await readChatRequest(req);
  if (messages instanceof Response) return messages;
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: object) =>
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
        );
      try {
        const upstream = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.LLM_API_KEY}`,
          },
          body: JSON.stringify({
            model: process.env.LLM_MODEL ?? "gpt-6.1-sol",
            stream: true,
            messages: [{ role: "system", content: agentSpec }, ...messages],
          }),
          signal: req.signal,
        });
        if (!upstream.ok || !upstream.body)
          throw new Error(`Provider answered ${upstream.status}`);
        for await (const data of readData(upstream.body)) {
          if (data === "[DONE]") break;
          const choice = JSON.parse(data).choices?.[0];
          if (choice?.delta?.content)
            send({ type: "text", text: choice.delta.content });
          if (choice?.finish_reason)
            send({
              type: "finish",
              reason: choice.finish_reason === "length" ? "length" : "stop",
            });
        }
      } catch (error) {
        if (req.signal.aborted) return; // The reader pressed Stop.
        console.error(error);
        send({ type: "error", message: "The model request failed." });
      }
      controller.close();
    },
  });
  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}

/** Yields the payload of each `data:` line in a server-sent event stream. */
async function* readData(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines)
      if (line.startsWith("data:")) yield line.slice(5).trim();
  }
}
