import { readSpecFile } from "./files";

/**
 * Parses the "#### Component: NAME" blocks of spec/genui.agent.full.md, the
 * source of the docs attribute tables and "For the model" notes.
 */
export interface ComponentAttribute {
  name: string;
  type: string;
  required: boolean;
  defaultValue?: string;
  description: string;
  /** Set when the attribute comes from a shared prop list the block references. */
  shared?: "layout" | "svg";
}

export interface ComponentSpec {
  name: string;
  attributes: ComponentAttribute[];
  /** The "Children:" category, such as inline, generic, raw, none or named child tags; empty for "layout". */
  children: string;
  /** Markdown guidance after the properties block, up to the next heading. */
  guidance: string;
}

const componentHeading = /^#### Component: (\S+)\s*$/;
const anyHeading = /^#{1,4} /;
const fence = /^\s*(`{3,}|~{3,})/;
const attributeLine = /^([A-Za-z][\w-]*): (.+?)(?: \(([^()]*)\))?$/;
const sharedLists = {
  layout: "Shared layout props:",
  svg: "Shared SVG props:",
};
const sharedDescriptions = {
  layout: "Shared layout prop",
  svg: "Shared SVG prop",
};
const sharedReferences: Record<string, keyof typeof sharedLists> = {
  layout: "layout",
  "svg props": "svg",
};

/** Lines with a flag for whether each sits inside a fenced code block (fences included). */
function scan(text: string) {
  let open: string | undefined;
  return text.split("\n").map((line) => {
    const marker = fence.exec(line)?.[1];
    const inFence = open !== undefined || marker !== undefined;
    if (marker && open === undefined) open = marker;
    else if (
      open &&
      line.trim() === marker &&
      marker[0] === open[0] &&
      marker.length >= open.length
    )
      open = undefined;
    return { line, inFence };
  });
}

/** The body of the first ```text fence at or after `start`, with the line after it. */
function textFence(lines: string[], start: number, end = lines.length) {
  const open = lines.findIndex(
    (line, index) => index >= start && index < end && line.trim() === "```text",
  );
  if (open < 0) return undefined;
  const close = lines.findIndex(
    (line, index) => index > open && line.trim() === "```",
  );
  if (close < 0) throw new Error("Unclosed text fence at line " + (open + 1));
  return { body: lines.slice(open + 1, close), next: close + 1 };
}

function capitalize(text: string) {
  return text ? text[0]!.toUpperCase() + text.slice(1) : text;
}

function parseAttribute(line: string): ComponentAttribute {
  const match = attributeLine.exec(line.trim());
  if (!match) throw new Error("Unrecognized attribute line: " + line);
  const [, name, type, details] = match as unknown as [
    string,
    string,
    string,
    string?,
  ];
  const parts = (details ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
  const defaultValue = parts
    .find((part) => part.startsWith("default "))
    ?.slice("default ".length);
  const notes = parts.filter(
    (part) => part !== "optional" && !part.startsWith("default "),
  );
  const description = capitalize(notes.join("; "));
  return {
    name,
    type,
    required: parts[0]?.startsWith("required") ?? false,
    ...(defaultValue ? { defaultValue } : {}),
    description,
  };
}

/** The line after the block starting at `index`: the next heading outside code fences. */
function blockEnd(scanned: ReturnType<typeof scan>, index: number) {
  let end = index + 1;
  while (
    end < scanned.length &&
    (scanned[end]!.inFence || !anyHeading.test(scanned[end]!.line))
  )
    end++;
  return end;
}

function parseShared(scanned: ReturnType<typeof scan>) {
  const lines = scanned.map((entry) => entry.line);
  const lists = {} as Record<keyof typeof sharedLists, ComponentAttribute[]>;
  let layoutGuidance = "";
  for (const [key, label] of Object.entries(sharedLists) as [
    keyof typeof sharedLists,
    string,
  ][]) {
    const at = lines.findIndex((line) => line.trim() === label);
    const block = at < 0 ? undefined : textFence(lines, at, at + 3);
    if (!block) throw new Error("Missing " + label + " block");
    lists[key] = block.body
      .filter((line) => line.trim())
      .map((line) => ({ ...parseAttribute(line), shared: key }));
    if (key === "layout")
      layoutGuidance = lines
        .slice(block.next, blockEnd(scanned, block.next - 1))
        .join("\n")
        .trim();
  }
  return { lists, layoutGuidance };
}

function parseBlock(
  name: string,
  lines: string[],
  shared: ReturnType<typeof parseShared>["lists"],
): ComponentSpec {
  const block = textFence(lines, 0);
  if (!block) throw new Error("Component " + name + " has no properties block");
  const attributes: ComponentAttribute[] = [];
  let children: string | undefined;
  let inProperties = false;
  for (const line of block.body) {
    if (!line.trim()) continue;
    if (line === "Properties: none") continue;
    if (line === "Properties:") {
      inProperties = true;
      continue;
    }
    const childLine = /^Children: (.+)$/.exec(line);
    if (childLine) {
      children = childLine[1]!.trim();
      inProperties = false;
      continue;
    }
    if (!inProperties || !line.startsWith("  "))
      throw new Error(`Component ${name}: unexpected line "${line}"`);
    const reference = sharedReferences[line.trim()];
    if (reference)
      attributes.push(
        ...shared[reference].map((item) => ({
          ...item,
          description: item.description || sharedDescriptions[reference],
        })),
      );
    else attributes.push(parseAttribute(line));
  }
  if (!children) throw new Error("Component " + name + " has no Children line");
  const guidance = lines.slice(block.next).join("\n").trim();
  return { name, attributes, children, guidance };
}

/**
 * Every component block of the full spec, keyed by tag name, plus "layout" for
 * the shared layout props that blocks reference. Throws on a block it cannot read.
 */
export function parseComponentSpecs(text: string): Map<string, ComponentSpec> {
  const scanned = scan(text);
  const lines = scanned.map((entry) => entry.line);
  const { lists, layoutGuidance } = parseShared(scanned);
  const specs = new Map<string, ComponentSpec>();
  scanned.forEach(({ line, inFence }, index) => {
    const name = !inFence && componentHeading.exec(line)?.[1];
    if (!name) return;
    if (specs.has(name)) throw new Error("Duplicate component block: " + name);
    const block = lines.slice(index + 1, blockEnd(scanned, index));
    specs.set(name, parseBlock(name, block, lists));
  });
  if (specs.has("layout")) throw new Error("A component block is named layout");
  specs.set("layout", {
    name: "layout",
    attributes: lists.layout,
    children: "",
    guidance: layoutGuidance,
  });
  return specs;
}

let cached: { text: string; specs: Map<string, ComponentSpec> } | undefined;

/** The named block of spec/genui.agent.full.md, re-read when the file changes. */
export function componentSpec(name: string): ComponentSpec {
  const text = readSpecFile("genui.agent.full.md");
  if (cached?.text !== text)
    cached = { text, specs: parseComponentSpecs(text) };
  const spec = cached.specs.get(name);
  if (!spec)
    throw new Error(
      `No "#### Component: ${name}" block in spec/genui.agent.full.md. Known: ` +
        "layout (the shared layout props), " +
        [...cached.specs.keys()].filter((key) => key !== "layout").join(", "),
    );
  return spec;
}
