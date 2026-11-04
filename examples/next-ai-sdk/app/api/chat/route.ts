import { openai } from "@ai-sdk/openai";
import { agentSpec } from "@snackbit/opendil/agent-spec";
import { convertToModelMessages, streamText, type UIMessage } from "ai";

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();
  const result = streamText({
    model: openai(process.env.LLM_MODEL ?? "gpt-6.1-sol"),
    instructions: agentSpec,
    messages: await convertToModelMessages(messages),
    // Stop the model when the reader presses Stop.
    abortSignal: req.signal,
  });
  return result.toUIMessageStreamResponse();
}
