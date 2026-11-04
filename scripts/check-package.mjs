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
  "dist/agent-spec.js",
  "dist/types/index.d.ts",
  "dist/types/ui.d.ts",
  "dist/types/agent-spec.d.ts",
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
  const pending = ["index.js", "ui.js", "agent-spec.js"];
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
    'import { agentSpec, agentSpecFull, agentSpecExamples } from "@snackbit/opendil/agent-spec";\nexport const prompts: string[] = [agentSpec, agentSpecFull, agentSpecExamples];\n',
  );
  await writeFile(
    join(scratch, "spec.mjs"),
    `import { readFile } from "node:fs/promises";
import { agentSpec, agentSpecFull, agentSpecExamples } from "@snackbit/opendil/agent-spec";
const specs = { "genui.agent.md": agentSpec, "genui.agent.full.md": agentSpecFull, "genui.examples.md": agentSpecExamples };
for (const [file, text] of Object.entries(specs))
  if (text !== await readFile(new URL(import.meta.resolve("@snackbit/opendil/spec/" + file)), "utf8"))
    throw new Error("Markdown export differs from agent-spec string: " + file);
console.log(JSON.stringify(specs));`,
  );
  await writeFile(
    join(scratch, "spec.cjs"),
    'const { agentSpec } = require("@snackbit/opendil/agent-spec");\nif (typeof agentSpec !== "string") throw new Error("require() cannot load agent-spec");\n',
  );
  const shippedSpecs = JSON.parse(run(process.execPath, ["spec.mjs"]));
  for (const file of specFiles)
    if (shippedSpecs[file] !== (await readFile("spec/" + file, "utf8")))
      throw new Error("Packed agent spec differs from spec/" + file);
  run(process.execPath, ["spec.cjs"]);
  await writeFile(
    join(scratch, "index.html"),
    '<div id="root"></div><script type="module" src="/main.tsx"></script>',
  );
  await writeFile(
    join(scratch, "main.tsx"),
    `
import { createRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { DilRenderer, type DilComponentProps, type DilRendererHandle } from "@snackbit/opendil";
import { Button, Tabs, TabsList, TabsTrigger, TabsContent, Select, SelectTrigger, SelectValue } from "@snackbit/opendil/ui";
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
const root = document.getElementById("root");
if (!root) throw new Error("Missing root");
createRoot(root).render(<>
<Button>Package UI</Button>
<Select><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger></Select>
<Tabs defaultValue="source"><TabsList><TabsTrigger value="source">Source</TabsTrigger></TabsList><TabsContent value="source">Content</TabsContent></Tabs>
<p id="outside" className="consumer-extension">Host page</p>
<button onClick={resume}>Resume following</button>
<DilRenderer ref={renderer} text="# Isolated package consumer" runtimeBaseUrl="/consumer/opendil/" progressiveReveal={{ staggerMs: 0, durationMs: 0 }} autoScroll />
<DilRenderer mode="host" text="<Custom>Host package consumer</Custom>" components={components} classNames={{ Custom: "rounded-xl p-4" }} progressiveReveal={{ staggerMs: 0, durationMs: 0 }} />
<DilRenderer mode="shadow" text="<Custom>Shadow package consumer</Custom>" components={components} classNames={{ Custom: "consumer-extension" }} shadowStyles=".consumer-extension{background-color:rgb(1,2,3)}" autoScroll={{ behavior: "smooth", padding: 32 }} />
<LayoutProbe mode="host" /><LayoutProbe mode="shadow" />
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
      response
        .writeHead(200, { "Content-Type": type })
        .end(await readFile(file));
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
  await page.reload();
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
    "Verified packed package contents, declarations, agent spec exports, CLI, all rendering modes, scoped CSS, stable streaming layout, and /consumer/ runtime paths: " +
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
