import { useRef, useState } from "react";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  status: "streaming" | "done" | "truncated" | "stopped" | "error";
};

type StreamEvent =
  | { type: "text"; text: string }
  | { type: "finish"; reason: "stop" | "length" }
  | { type: "error"; message: string };

export function useChatStream(api = "/api/chat") {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const request = useRef<AbortController | null>(null);

  const update = (
    id: string,
    change: (m: ChatMessage) => Partial<ChatMessage>,
  ) =>
    setMessages((list) =>
      list.map((m) => (m.id === id ? { ...m, ...change(m) } : m)),
    );

  async function run(history: ChatMessage[]) {
    const abort = new AbortController();
    request.current = abort;
    const id = crypto.randomUUID();
    setMessages([
      ...history,
      { id, role: "assistant", content: "", status: "streaming" },
    ]);
    let status: ChatMessage["status"] = "done";
    try {
      const response = await fetch(api, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Send earlier answers back exactly as the model wrote them.
        body: JSON.stringify({
          messages: history.map(({ role, content }) => ({ role, content })),
        }),
        signal: abort.signal,
      });
      if (!response.ok || !response.body) throw new Error(response.statusText);
      for await (const event of readEvents(response.body)) {
        if (event.type === "text")
          update(id, (m) => ({ content: m.content + event.text }));
        if (event.type === "finish" && event.reason === "length")
          status = "truncated";
        if (event.type === "error") status = "error";
      }
    } catch {
      status = abort.signal.aborted ? "stopped" : "error";
    }
    update(id, () => ({ status }));
    request.current = null;
  }

  return {
    messages,
    streaming: messages.some((m) => m.status === "streaming"),
    send: (text: string) =>
      run([
        ...messages,
        {
          id: crypto.randomUUID(),
          role: "user",
          content: text,
          status: "done",
        },
      ]),
    stop: () => request.current?.abort(),
    /** Drops the answer with this id and later turns, then asks again. */
    retry: (id: string) => {
      const index = messages.findIndex((m) => m.id === id);
      return run(messages.slice(0, index));
    },
  };
}

/** Reads the `data:` events of a server-sent event stream. */
async function* readEvents(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });
    let end;
    while ((end = buffer.indexOf("\n\n")) >= 0) {
      const event = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      if (event.startsWith("data:"))
        yield JSON.parse(event.slice(5)) as StreamEvent;
    }
  }
}
