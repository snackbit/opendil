import { readFile } from "node:fs/promises";
import path from "node:path";

/** The agent spec files served raw at stable URLs, in the order llms.txt lists them. */
export const specFiles = [
  {
    file: "genui.agent.md",
    url: "/agent-spec.md",
    title: "Agent Spec",
    description:
      "The primary spec. Put it in the system prompt of the model that writes DIL; it covers syntax, the stock components and the output rules.",
  },
  {
    file: "genui.agent.full.md",
    url: "/agent-spec.full.md",
    title: "Agent Spec: full reference",
    description:
      "Every component, attribute, callback and task. Load it, or search it for `Component: NAME`, when the primary spec is not enough.",
  },
  {
    file: "genui.examples.md",
    url: "/agent-spec.examples.md",
    title: "Agent Spec: examples",
    description:
      "Complete, runnable DIL documents per component and task, for few-shot prompting and evaluation.",
  },
] as const;

export type SpecFileName = (typeof specFiles)[number]["file"];

// next build, next start and next dev run in apps/site; the routes are prerendered at build time.
// A fixed path keeps output tracing from following a directory walk through the whole project.
function specBytes(file: SpecFileName): Promise<Buffer> {
  return readFile(path.join(process.cwd(), "../../spec", file));
}

/** The file as text, for llms-full.txt. */
export async function specText(file: SpecFileName): Promise<string> {
  return (await specBytes(file)).toString("utf8");
}

/** The file's bytes, unchanged, as text/markdown. Used by force-static route handlers. */
export async function specResponse(file: SpecFileName): Promise<Response> {
  return new Response(new Uint8Array(await specBytes(file)), {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
