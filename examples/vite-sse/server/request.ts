/** These standalone examples deliberately refuse public/production service. */
function localRequest(req: Request): boolean {
  if (process.env.NODE_ENV !== "development") return false;
  const local = (url: string) => {
    const parsed = new URL(url);
    return (
      parsed.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)
    );
  };
  try {
    const origin = req.headers.get("origin");
    return (
      local(req.url) &&
      (!origin || local(origin)) &&
      req.headers.get("sec-fetch-site") !== "cross-site"
    );
  } catch {
    return false;
  }
}

/** Bound bytes while reading; Content-Length alone does not bound chunked bodies. */
async function readBody(req: Request): Promise<unknown> {
  if (
    req.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !==
    "application/json"
  )
    throw new Error("Expected JSON");
  if (!req.body) throw new Error("Missing body");
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 65536) {
        await reader.cancel();
        throw new Error("Request too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}
export async function readChatRequest(
  req: Request,
): Promise<ChatMessage[] | Response> {
  if (!localRequest(req))
    return new Response(
      "This example accepts local development requests only.",
      { status: 403 },
    );
  try {
    const body = await readBody(req);
    if (
      !object(body) ||
      !Array.isArray(body.messages) ||
      !body.messages.length ||
      body.messages.length > 40
    )
      throw new Error("Invalid messages");
    const messages: ChatMessage[] = [];
    for (const message of body.messages) {
      if (
        !object(message) ||
        (message.role !== "user" && message.role !== "assistant") ||
        typeof message.content !== "string" ||
        message.content.length > 16000
      )
        throw new Error("Invalid message");
      messages.push({ role: message.role, content: message.content });
    }
    return messages;
  } catch {
    return new Response(
      "Expected at most 40 text messages in a JSON body of at most 64 KiB.",
      { status: 400 },
    );
  }
}
