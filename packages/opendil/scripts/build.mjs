import { build } from "esbuild";
import {
  readFile,
  mkdir,
  writeFile,
  rm,
  copyFile,
  mkdtemp,
  readdir,
} from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { publishDirectory } from "../bin/publish-directory.mjs";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
const require = createRequire(import.meta.url);
async function fixDeclarationImports(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = directory + "/" + entry.name;
    if (entry.isDirectory()) {
      await fixDeclarationImports(path);
    } else if (entry.name.endsWith(".d.ts")) {
      const source = await readFile(path, "utf8");
      const updated = source.replace(
        /((?:from\s+|import\s*\()\s*["'])(\.{1,2}\/[^"']+)(["'])/g,
        (match, prefix, specifier, quote) =>
          /\.(?:js|mjs|cjs|json)$/.test(specifier)
            ? match
            : prefix + specifier + ".js" + quote,
      );
      if (updated !== source) await writeFile(path, updated);
    }
  }
}
const agentSpecFiles = {
  PRIMARY: "genui.agent.md",
  FULL: "genui.agent.full.md",
  EXAMPLES: "genui.examples.md",
};
await mkdir(".tmp", { recursive: true });
const staging = await mkdtemp(".tmp/build-");
try {
  for (const directory of ["runtime", "spec", "test"])
    await mkdir(staging + "/" + directory, { recursive: true });
  const options = {
    bundle: true,
    platform: "browser",
    target: "es2022",
    minify: true,
    write: false,
  };
  const wasm = (
    await readFile(require.resolve("@jitl/quickjs-wasmfile-release-sync/wasm"))
  ).toString("base64");
  const vm = await build({
    ...options,
    format: "iife",
    entryPoints: ["src/dil/isolation/vm-worker.ts"],
    define: { __DIL_WASM__: JSON.stringify(wasm) },
  });
  const parser = await build({
    ...options,
    format: "iife",
    entryPoints: ["src/dil/parser/stream-worker.ts"],
  });
  const define = {
    __DIL_VM_WORKER__: JSON.stringify(vm.outputFiles[0].text),
    __DIL_PARSER_WORKER__: JSON.stringify(parser.outputFiles[0].text),
    // The frame announces this version so renderers can detect stale copied assets.
    __DIL_VERSION__: JSON.stringify(
      JSON.parse(await readFile("package.json", "utf8")).version,
    ),
  };
  // Unit tests run the standalone worker; renderers embed it, so it is not a runtime asset.
  await writeFile(staging + "/test/vm.js", vm.outputFiles[0].text);
  const frame = await build({
    ...options,
    format: "iife",
    entryPoints: ["src/dil/isolation/frame.tsx"],
    outfile: "frame.js",
    define,
  });
  await writeFile(
    staging + "/runtime/frame.js",
    frame.outputFiles.find((file) => file.path.endsWith(".js")).text,
  );
  const cssResult = await postcss([tailwind()]).process(
    (await readFile("styles/tailwind.css", "utf8")).replace(
      'source("../dist")',
      'source("../src")',
    ),
    { from: "styles/tailwind.css" },
  );
  const scoped = postcss.parse(cssResult.css);
  scoped.walkRules((rule) => {
    if (rule.parent.type === "atrule" && /keyframes$/.test(rule.parent.name))
      return;
    rule.selectors = rule.selectors.map((selector) =>
      /^(?::root|:host)$/.test(selector)
        ? ".dil-scope"
        : selector.includes(".dil-scope")
          ? selector
          : ":where(.dil-scope) " + selector,
    );
  });
  const css = scoped.toString();
  define.__DIL_STYLES__ = JSON.stringify(css);
  await writeFile(staging + "/styles.css", css);
  // Until frame.js runs, the loader pings the renderer every second so a slow
  // download is not reported as a missing runtime, and reports a frame.js that
  // failed to load. Its hash below must cover the exact text.
  const loader =
    '{let status="dil-loading";const ping=()=>parent.postMessage({type:status},"*");ping();const timer=setInterval(ping,1000);const script=document.createElement("script");script.src=new URL("./frame.js",location.href).href;script.onload=()=>clearInterval(timer);script.onerror=()=>{status="dil-failed";ping()};document.head.append(script)}';
  const hash = createHash("sha256").update(loader).digest("base64");
  const csp = `default-src 'none'; script-src 'sha256-${hash}' 'strict-dynamic' 'wasm-unsafe-eval'; style-src 'unsafe-inline'; worker-src blob:; child-src blob:; connect-src 'none'; img-src data:; font-src data:; base-uri 'none'; form-action 'none'; object-src 'none'`;
  await writeFile(
    staging + "/runtime/frame.html",
    `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="referrer" content="no-referrer"><style>${css.replaceAll("</style", "<\\/style")}</style></head><body style="margin:0"><div id="root"></div><script>${loader}</script></body></html>`,
  );
  const external = Object.keys(
    JSON.parse(await readFile("package.json", "utf8")).dependencies,
  ).concat(["react", "react-dom", "react/jsx-runtime"]);
  // Each area of the lib entry is its own module, so a bundler that sees an
  // app use only Button skips the Markdown renderer and its highlighter.
  const clientAreas = {
    "lib-ui": "src/entries/ui.ts",
    "lib-markdown": "src/entries/markdown.ts",
    "lib-serialize": "src/entries/serialize.ts",
  };
  const client = await build({
    ...options,
    write: true,
    format: "esm",
    splitting: true,
    metafile: true,
    // Every entry with React code builds together, so they share contexts and
    // other module state through common chunks.
    entryPoints: {
      index: "src/index.ts",
      testing: "src/testing.ts",
      ...clientAreas,
    },
    outdir: staging,
    external,
    define,
    banner: { js: '"use client";' },
  });
  // spec/ stays canonical; the package ships copies that version with the renderer.
  const specs = {};
  for (const [name, file] of Object.entries(agentSpecFiles)) {
    specs[name] = await readFile("../../spec/" + file, "utf8");
    await writeFile(staging + "/spec/" + file, specs[name]);
  }
  // Text extraction, export helpers and the specs run on servers too: no
  // React, workers, module state, or client directive.
  const neutral = await build({
    ...options,
    write: true,
    platform: "neutral",
    format: "esm",
    splitting: true,
    metafile: true,
    entryPoints: {
      "lib-text": "src/entries/text.ts",
      "lib-export": "src/entries/export.ts",
    },
    outdir: staging,
    external,
  });
  // The specs, unminified: each string stays a JSON literal on one line, and
  // the module has no imports, so edge runtimes load it too.
  const spec = await build({
    ...options,
    write: true,
    platform: "neutral",
    format: "esm",
    minify: false,
    metafile: true,
    entryPoints: { "lib-agent-spec": "src/entries/agent-spec.ts" },
    outdir: staging,
    define: Object.fromEntries(
      Object.entries(specs).map(([name, text]) => [
        "__DIL_AGENT_SPEC_" + name + "__",
        JSON.stringify(text),
      ]),
    ),
  });
  // src/lib.ts is the declaration source; this module re-exports each area
  // by name, which bundlers resolve without loading the unused areas.
  const reexports = [];
  for (const { metafile } of [client, neutral, spec])
    for (const [file, output] of Object.entries(metafile.outputs)) {
      const name = file.slice(staging.length + 1);
      if (/^lib-[\w-]+\.js$/.test(name) && output.entryPoint)
        reexports.push([
          name,
          `export { ${[...output.exports].sort().join(", ")} } from "./${name}";`,
        ]);
    }
  await writeFile(
    staging + "/lib.js",
    reexports
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, line]) => line)
      .join("\n") + "\n",
  );
  await copyFile("../../LICENSE", "LICENSE");
  await copyFile("../../README.md", "README.md");
  await copyFile("../../THIRD_PARTY_NOTICES.md", "THIRD_PARTY_NOTICES.md");
  execFileSync(
    process.execPath,
    [
      require.resolve("typescript/bin/tsc"),
      "-p",
      "tsconfig.build.json",
      "--outDir",
      staging + "/types",
    ],
    { stdio: "inherit" },
  );
  await fixDeclarationImports(staging + "/types");
  await publishDirectory(staging, "dist");
} finally {
  await rm(staging, { recursive: true, force: true });
}
