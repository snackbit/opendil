import { specResponse } from "@/lib/source/spec-files";

export const dynamic = "force-static";

/** spec/genui.examples.md byte for byte, for system prompts and agents. */
export function GET() {
  return specResponse("genui.examples.md");
}
