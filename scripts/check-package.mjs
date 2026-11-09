import { execFileSync } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  writeFile,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { createServer } from "node:http";
import { chromium, expect } from "@playwright/test";
const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
const release = resolve(".tmp/release");
await mkdir(release, { recursive: true });
// --ignore-scripts skips prepack, so prune superseded development chunks here.
execFileSync(process.execPath, ["packages/opendil/scripts/prune-dist.mjs"], {
  stdio: "pipe",
});
const built = JSON.parse(
  await readFile("packages/opendil/dist/.opendil-manifest.json", "utf8"),
).files;
const packed = JSON.parse(
  execFileSync(
    "npm",
    [
      "pack",
      "--workspace",
      "@snackbit/opendil",
      "--json",
      "--ignore-scripts",
      "--pack-destination",
      release,
    ],
    { encoding: "utf8" },
  ),
)[0];
const archive = join(release, packed.filename);
for (const file of packed.files) {
  if (
    !/^(dist\/|styles\/|bin\/|package.json$|README.md$|LICENSE$|THIRD_PARTY_NOTICES.md$)/.test(
      file.path,
    ) ||
    /^dist\/(?:test\/|\.opendil-manifest\.json$|runtime\/(?!frame\.(?:html|js)$))/.test(
      file.path,
    )
  )
    throw new Error("Unexpected package file: " + file.path);
  // Every shipped build file comes from the last build, never an earlier one.
  if (file.path.startsWith("dist/") && !(file.path.slice(5) in built))
    throw new Error("Package file from an earlier build: " + file.path);
}
const specFiles = [
  "genui.agent.md",
  "genui.agent.full.md",
  "genui.examples.md",
];
for (const expected of [
  "dist/index.js",
  "dist/lib.js",
  "dist/lib-ui.js",
  "dist/lib-markdown.js",
  "dist/lib-serialize.js",
  "dist/lib-text.js",
  "dist/lib-export.js",
  "dist/lib-agent-spec.js",
  "dist/testing.js",
  "dist/types/index.d.ts",
  "dist/types/lib.d.ts",
  "dist/types/testing.d.ts",
  "dist/styles.css",
  "dist/runtime/frame.html",
  "dist/runtime/frame.js",
  ...specFiles.map((file) => "dist/spec/" + file),
  "bin/opendil.mjs",
])
  if (!packed.files.some((file) => file.path === expected))
    throw new Error("Missing package file: " + expected);
const scratch = await mkdtemp(join(tmpdir(), "opendil-consumer-"));
let server;
let browser;
function run(command, args) {
  return execFileSync(command, args, {
    cwd: scratch,
    encoding: "utf8",
    stdio: "pipe",
    env: process.env,
  });
}
try {
  const version = (name) => lock.packages["node_modules/" + name].version;
  await writeFile(
    join(scratch, "package.json"),
    JSON.stringify({
      name: "opendil-consumer",
      version: "1.0.0",
      private: true,
      type: "module",
      dependencies: {
        "@snackbit/opendil": "file:" + archive,
        react: version("react"),
        "react-dom": version("react-dom"),
      },
      devDependencies: {
        vite: version("vite"),
        typescript: version("typescript"),
        "@types/react": version("@types/react"),
        "@types/react-dom": version("@types/react-dom"),
        tailwindcss: version("tailwindcss"),
        "@tailwindcss/postcss": version("@tailwindcss/postcss"),
      },
    }),
  );
  run("npm", [
    "install",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    "--prefer-online",
  ]);
  // Every shipped chunk is reachable from a JavaScript entry point.
  const installed = join(scratch, "node_modules/@snackbit/opendil/dist");
  const reachable = new Set();
  const pending = ["index.js", "lib.js", "testing.js"];
  while (pending.length) {
    const file = pending.pop();
    if (reachable.has(file)) continue;
    reachable.add(file);
    const code = await readFile(join(installed, file), "utf8");
    for (const match of code.matchAll(
      /(?:\bfrom\s*|\bimport\s*\(?\s*)["']\.\/([\w.-]+\.js)["']/g,
    ))
      pending.push(match[1]);
  }
  const unreferenced = packed.files
    .map((file) => file.path)
    .filter((path) => /^dist\/[^/]+\.js$/.test(path))
    .filter((path) => !reachable.has(path.slice(5)));
  if (unreferenced.length)
    throw new Error("Unreferenced package chunks: " + unreferenced.join(", "));
  // Server code reads the specs of the installed version without fs or a bundler.
  await writeFile(
    join(scratch, "server.ts"),
    'import { agentSpec, agentSpecFull, agentSpecExamples, extractDilText, literalMarkdown, type DilTextResult } from "@snackbit/opendil/lib";\nexport const prompts: string[] = [agentSpec, agentSpecFull, agentSpecExamples];\nexport const preview: DilTextResult = extractDilText(literalMarkdown("{x}"));\n',
  );
  // The lib entry imports in plain Node, without a DOM, so text extraction
  // runs on servers; its React half loads without touching window.
  await writeFile(
    join(scratch, "text.mjs"),
    `import { extractDilText, literalMarkdown, MarkdownRenderer, Button } from "@snackbit/opendil/lib";
if (typeof globalThis.window !== "undefined" || typeof MarkdownRenderer !== "function" || !Button)
  throw new Error("The lib entry needs a DOM or lacks its React exports");
const result = extractDilText(literalMarkdown("{1+1} <Button/>") + '\\n\\n<File fileKey="a" label={"Report"}/>');
if (JSON.stringify(result) !== JSON.stringify({ text: "{1+1} <Button/>\\nReport", truncated: false, components: [{ name: "File", literalAttributes: { fileKey: "a", label: "Report" } }] }))
  throw new Error("Unexpected text extraction: " + JSON.stringify(result));`,
  );
  await writeFile(
    join(scratch, "spec.mjs"),
    `import { readFile } from "node:fs/promises";
import { agentSpec, agentSpecFull, agentSpecExamples } from "@snackbit/opendil/lib";
const specs = { "genui.agent.md": agentSpec, "genui.agent.full.md": agentSpecFull, "genui.examples.md": agentSpecExamples };
for (const [file, text] of Object.entries(specs))
  if (text !== await readFile(new URL(import.meta.resolve("@snackbit/opendil/spec/" + file)), "utf8"))
    throw new Error("Markdown export differs from agent-spec string: " + file);
console.log(JSON.stringify(specs));`,
  );
  await writeFile(
    join(scratch, "spec.cjs"),
    'const { agentSpec } = require("@snackbit/opendil/lib");\nif (typeof agentSpec !== "string") throw new Error("require() cannot load the lib entry");\n',
  );
  const shippedSpecs = JSON.parse(run(process.execPath, ["spec.mjs"]));
  for (const file of specFiles)
    if (shippedSpecs[file] !== (await readFile("spec/" + file, "utf8")))
      throw new Error("Packed agent spec differs from spec/" + file);
  run(process.execPath, ["spec.cjs"]);
  run(process.execPath, ["text.mjs"]);
  await writeFile(
    join(scratch, "index.html"),
    '<div id="root"></div><script type="module" src="/main.tsx"></script>',
  );
  await writeFile(
    join(scratch, "main.tsx"),
    `
import { createRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { DilRenderer, type DilButtonProps, type DilComponentProps, type DilDiagram, type DilRendererHandle, type DilRenderError, type DilProblemProps, type DilMarkdownLinkProps, type DilUiPrimitives } from "@snackbit/opendil";
import { Button, exportSvg, literalMarkdown, MarkdownRenderer, rasterizeSvg, serializeRenderedDocument, Tabs, TabsList, TabsTrigger, TabsContent, Select, SelectTrigger, SelectValue } from "@snackbit/opendil/lib";
import "@snackbit/opendil/styles.css";
function Custom({children, className}: DilComponentProps) { return <aside className={className} aria-label="Consumer extension">{children}</aside>; }
const components = { Custom };
const renderer = createRef<DilRendererHandle>();
function resume() { renderer.current?.resumeAutoScroll(); }
function LayoutProbe({mode}: {mode: "host" | "shadow"}) {
  const [step, setStep] = useState(0);
  const chunks = ['{@body const [long,setLong]=DIL.useState(true)}\\n<box border padding={4} width={240}>\\n', '<button ', 'variant="outline">Action   ', '</button>\\n', '<text>{long?"A long paragraph that wraps over several lines in a narrow card and can legitimately shrink after a state change.":"Short"}</text><button onClick={()=>setLong(false)}>Shorten content</button></box>'];
  function next() { setStep(value => Math.min(chunks.length - 1, value + 1)); }
  return <section aria-label={mode + " layout"}><button onClick={next}>Next chunk</button><DilRenderer mode={mode} text={chunks.slice(0, step + 1).join("")} isStreaming={step < chunks.length - 1} /></section>;
}
// A response cut off after malformed source, finalized without new text as after Stop.
function StopProbe({mode}: {mode: "isolated" | "host" | "shadow"}) {
  const [streaming, setStreaming] = useState(true);
  const [problems, setProblems] = useState<DilRenderError[]>([]);
  const text = '<slider max=5 value="1"/><grid><box border>First card</box><box border>Thi';
  const props = { text, isStreaming: streaming, onError: (problem: DilRenderError) => setProblems(list => [...list, problem]) };
  return <section aria-label={mode + " stop"}><button onClick={() => setStreaming(false)}>Stop</button><output aria-label={mode + " problems"}>{problems.map(problem => problem.kind + "@" + problem.offset).join(" ")}</output>{mode === "isolated" ? <DilRenderer {...props} runtimeBaseUrl="/consumer/opendil/" /> : <DilRenderer {...props} mode={mode} />}</section>;
}
function Link({ href, children }: DilMarkdownLinkProps) { return <a href={href}>{children}</a>; }
function Problem({ scope, error }: DilProblemProps) { return <span data-problem={scope} data-error-code={error.code}>Host problem</span>; }
const markdownComponents = { link: Link };
const diagnostics = { console: false, Problem };
// Host design variables reach an inheriting renderer; the stock theme keeps its own.
function InheritProbe() {
  return <section aria-label="inherit probe" style={{ ["--foreground" as string]: "rgb(7, 8, 9)" }}>
    <MarkdownRenderer text={"[Package docs](https://example.com/docs) <Button onClick={go}/>"} markdownComponents={markdownComponents} theme="inherit" />
    <DilRenderer mode="host" theme="inherit" showStatus={false} markdownComponents={markdownComponents} diagnostics={diagnostics} text={"Inherited [link](https://example.com/dil)\\n\\n<Unknown/>\\n\\n" + literalMarkdown("Literal {1+1}")} />
    <DilRenderer mode="host" showStatus={false} text="Stock text" />
  </section>;
}
// The host's own button inside stock widgets, and copying what the answer shows.
function ConsumerButton({ variant, size, ...props }: DilButtonProps) { return <button {...props} data-consumer-button={variant ?? "default"} />; }
const uiPrimitives: DilUiPrimitives = { Button: ConsumerButton };
const copied = createRef<DilRendererHandle>();
function CopyProbe() {
  const [copy, setCopy] = useState("");
  return <section aria-label="copy probe">
    <DilRenderer ref={copied} mode="host" showStatus={false} uiPrimitives={uiPrimitives} text={"## Copied\\n\\n<button>Consumer action</button>\\n\\n<checkbox checked={true}>Done</checkbox>"} />
    <button onClick={() => setCopy((copied.current?.serialize()?.markdown ?? "") + "|" + serializeRenderedDocument(document.body).html.length)}>Copy answer</button>
    <output aria-label="copied markdown">{copy}</output>
  </section>;
}
// Code tokens from the host, and a host textarea rule that outranks OpenDIL's.
const code = '<CodeBlock language="ts" editable>\\nconst a = 1;\\n\\tconst b = 2;\\nconst c = 3;\\n</CodeBlock>';
function CodeProbe() {
  return <section aria-label="code probe" id="code-probe" style={{ ["--dil-code-font-size" as string]: "15px", ["--dil-code-line-height" as string]: "1.5" }}>
    <style>{"#code-probe [data-hostile] textarea{font-size:22px;line-height:40px;letter-spacing:2px;padding:1px 3px}"}</style>
    <div data-tokens=""><DilRenderer mode="host" showStatus={false} text={code} /></div>
    <div data-hostile=""><DilRenderer mode="host" showStatus={false} text={code} /></div>
  </section>;
}
// The host opens a rendered diagram and exports it as SVG and PNG.
function DiagramProbe() {
  const [result, setResult] = useState("");
  async function open(diagram: DilDiagram) {
    const png = await rasterizeSvg(diagram.svg, { scale: 2, background: "white" });
    const clear = await rasterizeSvg(diagram.svg, { scale: 1, background: "transparent" });
    const pixel = async (blob: Blob) => {
      const bitmap = await createImageBitmap(blob);
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext("2d");
      context?.drawImage(bitmap, 0, 0);
      return [bitmap.width, bitmap.height, context?.getImageData(0, 0, 1, 1).data[3]].join("x");
    };
    setResult([diagram.title, Math.ceil(diagram.width * 2) + "x" + Math.ceil(diagram.height * 2), await pixel(png), await pixel(clear), png.type, exportSvg(diagram.svg).type, diagram.source.length].join("|"));
  }
  return <section aria-label="diagram probe">
    <DilRenderer mode="host" showStatus={false} onOpenDiagram={open} text={"\`\`\`mermaid\\nflowchart LR\\n  accTitle: Release flow\\n  Build --> Ship\\n\`\`\`"} />
    <output aria-label="diagram result">{result}</output>
  </section>;
}
const root = document.getElementById("root");
if (!root) throw new Error("Missing root");
createRoot(root).render(location.search === "?stop" ? <><StopProbe mode="isolated" /><StopProbe mode="host" /><StopProbe mode="shadow" /></> : <>
<Button>Package UI</Button>
<Select><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger></Select>
<Tabs defaultValue="source"><TabsList><TabsTrigger value="source">Source</TabsTrigger></TabsList><TabsContent value="source">Content</TabsContent></Tabs>
<p id="outside" className="consumer-extension">Host page</p>
<button onClick={resume}>Resume following</button>
<DilRenderer ref={renderer} text="# Isolated package consumer" runtimeBaseUrl="/consumer/opendil/" progressiveReveal={{ staggerMs: 0, durationMs: 0 }} autoScroll />
<DilRenderer mode="host" text="<Custom>Host package consumer</Custom>" components={components} classNames={{ Custom: "rounded-xl p-4" }} progressiveReveal={{ staggerMs: 0, durationMs: 0 }} />
<DilRenderer mode="shadow" text="<Custom>Shadow package consumer</Custom>" components={components} classNames={{ Custom: "consumer-extension" }} shadowStyles=".consumer-extension{background-color:rgb(1,2,3)}" autoScroll={{ behavior: "smooth", padding: 32 }} />
<LayoutProbe mode="host" /><LayoutProbe mode="shadow" />
<InheritProbe />
<CopyProbe />
<CodeProbe />
<DiagramProbe />
</>);
`,
  );
  await writeFile(
    join(scratch, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        lib: ["ES2022", "DOM"],
        module: "ESNext",
        moduleResolution: "Bundler",
        jsx: "react-jsx",
        strict: true,
        skipLibCheck: true,
        noEmit: true,
      },
      include: ["*.tsx", "*.ts"],
    }),
  );
  run(process.execPath, ["node_modules/typescript/bin/tsc"]);
  run(process.execPath, [
    "node_modules/typescript/bin/tsc",
    "--module",
    "NodeNext",
    "--moduleResolution",
    "NodeNext",
    "--skipLibCheck",
    "false",
  ]);
  const cli = "node_modules/@snackbit/opendil/bin/opendil.mjs";
  if (!run(process.execPath, [cli, "--help"]).includes("Usage: opendil"))
    throw new Error("CLI help is missing usage");
  run(process.execPath, [cli, "copy-assets", "--out", "public/opendil"]);
  const copied = run(process.execPath, [
    cli,
    "copy-assets",
    "--out=public/opendil",
  ]);
  if (!/^Copied 2 files \([\d.]+ MB\) from @snackbit\/opendil@/.test(copied))
    throw new Error("Unexpected copy-assets summary: " + copied);
  const assets = (await readdir(join(scratch, "public/opendil"))).sort();
  if (
    assets.join() !==
    [".opendil-manifest.json", "frame.html", "frame.js"].join()
  )
    throw new Error("Unexpected copied runtime assets: " + assets.join(", "));
  run(process.execPath, [
    "node_modules/vite/bin/vite.js",
    "build",
    "--base",
    "/consumer/",
  ]);
  for (const asset of await readdir(join(scratch, "dist/assets")))
    if (
      (await readFile(join(scratch, "dist/assets", asset), "utf8")).includes(
        "# GenUI Agent Specification",
      )
    )
      throw new Error("The browser bundle contains the agent spec: " + asset);
  server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(
        new URL(request.url, "http://localhost").pathname,
      );
      if (!pathname.startsWith("/consumer/")) {
        response.writeHead(404).end();
        return;
      }
      const file = resolve(
        scratch,
        "dist",
        pathname.slice("/consumer/".length) || "index.html",
      );
      if (!file.startsWith(join(scratch, "dist") + "/")) {
        response.writeHead(403).end();
        return;
      }
      const type = file.endsWith(".html")
        ? "text/html"
        : file.endsWith(".js")
          ? "text/javascript"
          : file.endsWith(".css")
            ? "text/css"
            : "application/octet-stream";
      // Read first: a missing file must still be answered with a 404.
      const body = await readFile(file);
      response.writeHead(200, { "Content-Type": type }).end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing consumer server address");
  browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // Nothing the package renders, diagrams included, fetches from elsewhere.
  const origin = "http://127.0.0.1:" + address.port;
  const remote = [];
  page.on("request", (request) => {
    const url = request.url();
    if (!url.startsWith(origin) && !/^(?:data|blob):/.test(url))
      remote.push(url);
  });
  await page.goto("http://127.0.0.1:" + address.port + "/consumer/");
  await page
    .frameLocator("iframe")
    .getByRole("heading", { name: "Isolated package consumer" })
    .waitFor();
  await expect(
    page.frameLocator("iframe").getByText("Complete", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Consumer extension")
    .getByText("Host package consumer")
    .waitFor();
  if (
    (await page
      .locator("#outside")
      .evaluate((element) => getComputedStyle(element).fontSize)) !== "16px"
  )
    throw new Error("Package styles affected the host page");
  if (errors.length) throw new Error(errors.join("\n"));
  const shadow = page.locator('[data-dil-mode="shadow"]').first();
  await expect(shadow.getByLabel("Consumer extension")).toHaveCSS(
    "background-color",
    "rgb(1, 2, 3)",
  );
  await expect(page.locator("#outside")).not.toHaveCSS(
    "background-color",
    "rgb(1, 2, 3)",
  );
  const inherit = page.getByLabel("inherit probe", { exact: true });
  await expect(
    inherit.getByRole("link", { name: "Package docs", exact: true }),
  ).toHaveAttribute("href", "https://example.com/docs");
  await expect(inherit.getByText("<Button onClick={go}/>")).toBeVisible();
  await expect(
    inherit.getByRole("link", { name: "link", exact: true }),
  ).toHaveAttribute("href", "https://example.com/dil");
  await expect(inherit.locator('[data-problem="part"]')).toHaveAttribute(
    "data-error-code",
    "unknown-component",
  );
  await expect(
    inherit.getByText("Literal {1+1}", { exact: true }),
  ).toBeVisible();
  await expect(inherit.getByText("Inherited", { exact: false })).toHaveCSS(
    "color",
    "rgb(7, 8, 9)",
  );
  await expect(inherit.getByText("Stock text", { exact: true })).toHaveCSS(
    "color",
    "rgb(13, 13, 13)",
  );
  const copyProbe = page.getByLabel("copy probe", { exact: true });
  await expect(
    copyProbe.getByRole("button", { name: "Consumer action", exact: true }),
  ).toHaveAttribute("data-consumer-button", "default");
  await copyProbe
    .getByRole("button", { name: "Copy answer", exact: true })
    .click();
  await expect(copyProbe.getByLabel("copied markdown")).toHaveText(
    /^## Copied\s+\[x\] Done\|\d+$/,
  );
  // Both editor layers share one set of metrics: from the host's code tokens,
  // or from a host textarea rule that outranks the package's styles.
  const codeProbe = page.getByLabel("code probe", { exact: true });
  for (const [variant, size, lineHeight] of [
    ["tokens", "15px", "22.5px"],
    ["hostile", "22px", "40px"],
  ]) {
    const block = codeProbe.locator(`[data-${variant}] .dil-code-block`);
    await block.getByRole("textbox", { name: "Code editor" }).waitFor();
    const metrics = await block.evaluate((element) => {
      const input = element.querySelector("textarea");
      const layer = element.querySelector(".dil-code-highlight");
      if (!input || !layer) throw new Error("Missing editor layers");
      const read = (node) => {
        const css = getComputedStyle(node);
        return [
          css.fontFamily,
          css.fontSize,
          css.lineHeight,
          css.letterSpacing,
          css.tabSize,
          css.paddingTop,
          css.paddingLeft,
          css.whiteSpace,
        ].join(" ");
      };
      const box = (node) => node.getBoundingClientRect();
      return {
        input: read(input),
        layer: read(layer),
        size: getComputedStyle(input).fontSize,
        lineHeight: getComputedStyle(input).lineHeight,
        heights: [box(input).height, box(layer).height, input.scrollHeight],
        padding:
          parseFloat(getComputedStyle(input).paddingTop) +
          parseFloat(getComputedStyle(input).paddingBottom),
      };
    });
    if (metrics.input !== metrics.layer)
      throw new Error(
        `Editor layers differ (${variant}): ${metrics.input} / ${metrics.layer}`,
      );
    if (metrics.size !== size || metrics.lineHeight !== lineHeight)
      throw new Error(
        `Editor metrics (${variant}): ${metrics.size} ${metrics.lineHeight}`,
      );
    // Three lines of code: the frame fits them, without empty rows.
    const [inputHeight, layerHeight] = metrics.heights;
    const expected = 3 * parseFloat(lineHeight) + metrics.padding;
    if (
      Math.abs(inputHeight - expected) > 2 ||
      Math.abs(layerHeight - inputHeight) > 0.5
    )
      throw new Error(
        `Editor height (${variant}): ${metrics.heights.join(", ")}, expected ${expected}`,
      );
  }
  const diagramProbe = page.getByLabel("diagram probe", { exact: true });
  await diagramProbe
    .getByRole("button", { name: "Open diagram", exact: true })
    .click();
  await expect(diagramProbe.getByLabel("diagram result")).toHaveText(
    /^Release flow\|(\d+x\d+)\|\1x255\|\d+x\d+x0\|image\/png\|image\/svg\+xml;charset=utf-8\|\d+$/,
  );
  if (remote.length) throw new Error("Remote requests: " + remote.join(", "));
  for (const mode of ["host", "shadow"]) {
    const probe = page.getByLabel(mode + " layout", { exact: true });
    const box = probe.locator('[data-d-component="box"]');
    await expect(box).toBeVisible();
    const initial = await box.boundingBox();
    if (!initial) throw new Error("Missing card");
    await probe
      .getByRole("button", { name: "Next chunk", exact: true })
      .click();
    await expect(box).toHaveJSProperty(
      "offsetHeight",
      Math.round(initial.height),
    );
    await expect(probe.locator(".dil-skeleton")).toHaveCount(0);
    await probe
      .getByRole("button", { name: "Next chunk", exact: true })
      .click();
    const button = probe.getByRole("button", { name: "Action", exact: true });
    await expect(button).toBeDisabled();
    const handle = await button.elementHandle(),
      size = await box.boundingBox();
    if (!handle || !size) throw new Error("Missing control shell");
    await probe
      .getByRole("button", { name: "Next chunk", exact: true })
      .click();
    await expect(button).toBeEnabled();
    if (!(await handle.evaluate((element) => element.isConnected)))
      throw new Error("Control was replaced");
    await expect(box).toHaveJSProperty("offsetHeight", Math.round(size.height));
    await probe
      .getByRole("button", { name: "Next chunk", exact: true })
      .click();
    await expect(
      probe.getByRole("button", { name: "Shorten content", exact: true }),
    ).toBeEnabled();
    const grown = await box.boundingBox();
    if (!grown) throw new Error("Missing populated card");
    await probe
      .getByRole("button", { name: "Shorten content", exact: true })
      .click();
    await expect(probe.getByText("Short", { exact: true })).toBeVisible();
    await expect
      .poll(async () => (await box.boundingBox())?.height ?? Infinity)
      .toBeLessThan(grown.height);
  }
  await page.goto("http://127.0.0.1:" + address.port + "/consumer/?stop");
  for (const mode of ["isolated", "host", "shadow"]) {
    const probe = page.getByLabel(mode + " stop", { exact: true });
    const ui = mode === "isolated" ? probe.frameLocator("iframe") : probe;
    await expect(ui.getByText("First card", { exact: true })).toBeVisible();
    await expect(
      ui.getByText("Receiving document", { exact: true }),
    ).toBeVisible();
    await probe.getByRole("button", { name: "Stop", exact: true }).click();
    await expect(ui.getByText("Incomplete", { exact: true })).toBeVisible();
    await expect(
      ui.getByText("This response ended before it was finished."),
    ).toBeVisible();
    await expect(
      ui.getByText("This part of the response couldn't be shown."),
    ).toBeVisible();
    await expect(probe.getByLabel(mode + " problems")).toHaveText(
      "syntax@0 incomplete@25",
    );
  }
  if (errors.length) throw new Error(errors.join("\n"));
  // Rebuild before opening the page: a page still loading while the build
  // replaces its assets fails to fetch the lazy host chunk.
  const main = await readFile(join(scratch, "main.tsx"), "utf8");
  await writeFile(
    join(scratch, "main.tsx"),
    main.replace(
      "@snackbit/opendil/styles.css",
      "@snackbit/opendil/tailwind.css",
    ),
  );
  await writeFile(
    join(scratch, "vite.config.mjs"),
    'import tailwind from "@tailwindcss/postcss"; export default { css: { postcss: { plugins: [tailwind()] } } };',
  );
  run(process.execPath, [
    "node_modules/vite/bin/vite.js",
    "build",
    "--base",
    "/consumer/",
  ]);
  await page.goto("http://127.0.0.1:" + address.port + "/consumer/");
  const hostExtension = page
    .locator('[data-dil-mode="host"]')
    .first()
    .getByLabel("Consumer extension");
  await hostExtension.waitFor();
  if (
    (await page
      .locator('[data-dil-mode="host"]')
      .first()
      .getByLabel("Consumer extension")
      .evaluate((element) => getComputedStyle(element).borderRadius)) !== "16px"
  )
    throw new Error(
      "Consumer Tailwind source did not generate the configured class",
    );
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(
    "Verified packed package contents, declarations, agent spec exports, CLI, all rendering modes, scoped CSS, theme inheritance, Markdown overrides, host diagnostics, injected UI primitives, rendered copies, code editor metrics under host CSS, diagram open and export without remote requests, text extraction in Node, stable streaming layout, interrupted documents with onError, and /consumer/ runtime paths: " +
      archive,
  );
} catch (error) {
  if (error && typeof error === "object" && "stderr" in error)
    console.error(String(error.stderr));
  throw error;
} finally {
  await browser?.close();
  if (server) await new Promise((done) => server.close(done));
  await rm(scratch, { recursive: true, force: true });
}
