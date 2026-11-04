import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** The agent spec files at the repository root, shipped with the package and rendered by the docs. */
export const specFiles = [
  "genui.agent.md",
  "genui.agent.full.md",
  "genui.examples.md",
] as const;
export type SpecFile = (typeof specFiles)[number];

/** The docs page that renders each spec file, for links between the files. */
export const specPages: Record<SpecFile, string> = {
  "genui.agent.md": "/docs/agent-spec/",
  "genui.agent.full.md": "/docs/agent-spec/full/",
  "genui.examples.md": "/docs/agent-spec/examples/",
};

export function isSpecFile(value: unknown): value is SpecFile {
  return (specFiles as readonly unknown[]).includes(value);
}

let root: string | undefined;

/**
 * The repository root, found from the working directory: Next.js builds run in
 * apps/site and tests run at the root. Bundlers break `new URL(import.meta.url)`.
 */
function repositoryRoot(): string {
  if (root) return root;
  for (let directory = process.cwd(); ; directory = dirname(directory)) {
    if (existsSync(join(directory, "spec", "genui.agent.full.md")))
      return (root = directory);
    if (dirname(directory) === directory)
      throw new Error(
        "spec/genui.agent.full.md not found above " + process.cwd(),
      );
  }
}

export function specPath(file: SpecFile): string {
  return join(repositoryRoot(), "spec", file);
}

export function readSpecFile(file: SpecFile): string {
  return readFileSync(specPath(file), "utf8");
}
