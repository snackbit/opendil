import { compile } from "@mdx-js/mdx";
import { remarkGfm } from "fumadocs-core/mdx-plugins/remark-gfm";
import { remarkHeading } from "fumadocs-core/mdx-plugins/remark-heading";
import { remarkLLMs } from "fumadocs-core/mdx-plugins/remark-llms";
import { remarkStructure } from "fumadocs-core/mdx-plugins/remark-structure";
import { VFile } from "vfile";
import { describe, expect, it } from "vitest";
import {
  componentSpec,
  parseComponentSpecs,
} from "../../apps/site/lib/spec/components";
import { readSpecFile } from "../../apps/site/lib/spec/files";
import { componentPropsMarkdown } from "../../apps/site/lib/markdown/spec-content";
import { remarkDocs } from "../../apps/site/lib/markdown/remark-docs";
import { exampleSource } from "../../apps/site/lib/examples/sources";

const fullSpec = readSpecFile("genui.agent.full.md");

describe("component blocks of the full spec", () => {
  const specs = parseComponentSpecs(fullSpec);

  it("parses every #### Component: block", () => {
    const headings = [...fullSpec.matchAll(/^#### Component: (\S+)$/gm)].map(
      (match) => match[1],
    );
    expect(headings.length).toBeGreaterThan(30);
    expect([...specs.keys()]).toEqual([...headings, "layout"]);
    for (const spec of specs.values()) {
      if (spec.name !== "layout") expect(spec.children, spec.name).not.toBe("");
      expect(spec.guidance, spec.name).not.toMatch(/^#/m);
      for (const item of spec.attributes) {
        expect(item.name, spec.name).toMatch(/^[A-Za-z][\w-]*$/);
        expect(item.type, spec.name + "." + item.name).not.toBe("");
      }
    }
  });

  it("reads types, defaults, requirements and notes", () => {
    const slider = specs.get("slider")!;
    const marks = slider.attributes.find((item) => item.name === "marks")!;
    expect(marks).toMatchObject({
      type: "{label:string}[]",
      defaultValue: "no marks",
      required: false,
    });
    const change = slider.attributes.find((item) => item.name === "onChange")!;
    expect(change.type).toBe("callback (value:number) => void");
    expect(slider.children).toBe("none");
    const title = specs
      .get("title")!
      .attributes.find((item) => item.name === "weight");
    expect(title?.description).toBe(
      "Consumed but does not override title weight",
    );
    const image = specs.get("AsyncImage")!.attributes[0]!;
    expect(image).toMatchObject({ name: "query", required: true });
    expect(image.description).toBe("Required for generation");
  });

  it("expands shared layout and SVG prop references", () => {
    const box = specs.get("box")!;
    expect(box.attributes.map((item) => item.name)).toContain("maxWidth");
    expect(box.attributes.every((item) => item.shared === "layout")).toBe(true);
    const svg = specs.get("svg")!;
    expect(
      svg.attributes.find((item) => item.name === "viewBox"),
    ).toMatchObject({
      type: "string",
      shared: "svg",
      description: "Shared SVG prop",
    });
    expect(specs.get("spacer")!.attributes).toEqual([]);
  });

  it("offers the shared layout props as the layout pseudo-component", () => {
    const layout = specs.get("layout")!;
    expect(layout.attributes.map((item) => item.name)).toEqual(
      specs.get("box")!.attributes.map((item) => item.name),
    );
    expect(layout.attributes[0]).toMatchObject({
      name: "padding",
      description: "",
    });
    expect(layout.guidance).toMatch(
      /^Only components whose Properties block lists `layout`/,
    );
    expect(layout.guidance).not.toContain("Text components");
    expect(componentPropsMarkdown(layout)).not.toContain("Children");
  });

  it("keeps the guidance up to the next heading, examples included", () => {
    const code = specs.get("CodeBlock")!.guidance;
    expect(code).toMatch(/^Place source directly/);
    expect(code).toContain("```dil\n<CodeBlock");
    expect(code).toMatch(/permission to execute code\.$/);
    // box is followed by a "#### Task:" block, which is not part of it.
    expect(specs.get("box")!.guidance).not.toContain("static-card");
  });

  it("rejects a block it cannot read", () => {
    const broken = fullSpec.replace(
      "  tabularNums: boolean (optional; default false)\n",
      "  tabularNums boolean\n",
    );
    expect(() => parseComponentSpecs(broken)).toThrow(
      /Unrecognized attribute line/,
    );
    expect(() => componentSpec("not-a-component")).toThrow(
      /Known: layout \(the shared layout props\), text,/,
    );
  });

  it("builds a table whose pipes do not split cells", () => {
    const table = componentPropsMarkdown(componentSpec("title"));
    const sizeRow = table
      .split("\n")
      .find((line) => line.startsWith("| `size`"))!;
    expect(sizeRow).toContain('`"xs" \\| "sm"');
    expect(sizeRow.split(/(?<!\\)\|/).length).toBe(6);
    expect(table).toMatch(/\*\*Children:\*\* `inline`: text, inline Markdown/);
    expect(componentPropsMarkdown(componentSpec("divider"))).toMatch(
      /^This component takes no attributes\./,
    );
  });
});

const contractPage = `## Install

<Tabs groupId="pm" items={["npm", "pnpm"]} persist>
<Tab value="npm">

\`\`\`bash
npm install @snackbit/opendil
\`\`\`

</Tab>
<Tab value="pnpm">Run pnpm add.</Tab>
</Tabs>

<Steps>
<Step>
### Install the package

Add it to your app.
</Step>
<Step>
Render it.
</Step>
</Steps>

<Callout type="warn" title="Careful">
Stream **only** model output.
</Callout>

<Cards>
  <Card title="Renderer" href="/docs/renderer/" description="The API." />
</Cards>

{/* An authoring comment. */}

<LiveExample id="form" mode="shadow" />

<LiveExample id="large" />

## Slider

<ComponentProps name="slider" />

<SpecExcerpt name="slider" />

<SourceDisclosure label="Show the stylesheet">
\`\`\`css
.note { color: red; }
\`\`\`
</SourceDisclosure>

<CustomizationPlayground variant="styling" />

<SpecDocument file="genui.examples.md" />
`;

async function compileContract() {
  const file = new VFile({ value: contractPage, path: "contract.mdx" });
  const compiled = await compile(file, {
    remarkPlugins: [
      remarkDocs,
      remarkGfm,
      remarkHeading,
      remarkStructure,
      [remarkLLMs, { _data: true }],
    ],
  });
  return {
    code: String(compiled.value),
    markdown: compiled.data.markdown as string,
    structured: compiled.data.structuredData as {
      headings: { content: string }[];
      contents: { content: string }[];
    },
  };
}

describe("docs MDX contract", () => {
  it("writes Markdown output without JSX", async () => {
    const { markdown } = await compileContract();
    // DIL in code fences may use custom tags such as <Callout>; prose may not hold JSX.
    const prose = markdown.replace(/^(`{3,})[^\n]*\n[\s\S]*?^\1$/gm, "");
    expect(prose.match(/<[A-Z][\w.]*[\s/>].*/)?.[0]).toBeUndefined();
    expect(markdown).not.toContain("{/*");
    expect(markdown).toMatch(/### npm\n\n```bash\nnpm install/);
    expect(markdown).toContain("### pnpm\n\nRun pnpm add.");
    expect(markdown).toContain(
      "1. **Install the package**\n\n   Add it to your app.",
    );
    expect(markdown).toContain("2. Render it.");
    expect(markdown).toContain(
      "> [!WARNING]\n> **Careful**\n>\n> Stream **only** model output.",
    );
    expect(markdown).toContain("- [Renderer](/docs/renderer/): The API.");
    expect(markdown).toContain(
      '```dil title="Form controls"\n' + exampleSource("form"),
    );
    expect(markdown).toMatch(
      /The Large document example builds its source in the browser: \[open it in the playground\]\(\/demo\/large\/\)/,
    );
    expect(markdown).toMatch(
      /\| `marks` +\| `\{label:string\}\[\]` +\| no marks/,
    );
    expect(markdown).toContain(
      "> **For the model**\n>\n> Use a finite numeric range",
    );
    expect(markdown).toContain("**Show the stylesheet**\n\n```css");
    expect(markdown).toContain('```dil title="Custom components"');
    expect(markdown).toContain("## 1. Output format and safety");
    expect(markdown).not.toContain("# GenUI Examples");
  });

  it("indexes generated tables and spec text for search", async () => {
    const { structured } = await compileContract();
    const contents = structured.contents.map((item) => item.content).join("\n");
    expect(contents).toMatch(/marks/);
    expect(contents).toMatch(/Use a finite numeric range/);
    expect(structured.headings.map((item) => item.content)).toContain(
      "1. Output format and safety",
    );
  });

  it("compiles generated nodes into the page", async () => {
    const { code } = await compileContract();
    expect(code).toContain('"For the model"');
    expect(code).toContain("_components.table");
    expect(code).not.toMatch(/ComponentProps|SpecExcerpt|SpecDocument/);
  });

  it("fails the build on an unknown component or example", async () => {
    await expect(
      compile('<ComponentProps name="nope" />', {
        remarkPlugins: [remarkDocs],
      }),
    ).rejects.toThrow(/No "#### Component: nope" block/);
    await expect(
      compile('<LiveExample id="nope" />', { remarkPlugins: [remarkDocs] }),
    ).rejects.toThrow(/is not an example/);
    await expect(
      compile('<LiveExample id="form" mode="iframe" />', {
        remarkPlugins: [remarkDocs],
      }),
    ).rejects.toThrow(/mode> must be shadow, host, isolated/);
    await expect(
      compile('<SpecDocument file="../package.json" />', {
        remarkPlugins: [remarkDocs],
      }),
    ).rejects.toThrow(/is not a spec file/);
  });
});
