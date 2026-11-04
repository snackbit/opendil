import { specResponse } from "@/lib/source/spec-files";

export const dynamic = "force-static";

/** spec/genui.agent.full.md byte for byte, for system prompts and agents. */
export function GET() {
  return specResponse("genui.agent.full.md");
}
