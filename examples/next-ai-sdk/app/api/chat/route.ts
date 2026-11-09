import { openai } from "@ai-sdk/openai";
import { agentSpec } from "@snackbit/opendil/lib";
import { convertToModelMessages, streamText } from "ai";
import { readChatRequest } from "./request";

export async function POST(req: Request) {
  const messages = await readChatRequest(req);
  if (messages instanceof Response) return messages;
  const result = streamText({
    model: openai(process.env.LLM_MODEL ?? "gpt-6.1-sol"),
    instructions: agentSpec,
    messages: await convertToModelMessages(messages),
    // Stop the model when the reader presses Stop.
    abortSignal: req.signal,
  });
  return result.toUIMessageStreamResponse();
}
