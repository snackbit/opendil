import { build } from "esbuild";
import {
  readFile,
  mkdir,
  writeFile,
  rm,
  copyFile,
  mkdtemp,
} from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { publishDirectory } from "../bin/publish-directory.mjs";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
const require = createRequire(import.meta.url);
await mkdir(".tmp", { recursive: true });
const staging = await mkdtemp(".tmp/build-");
try {
  await mkdir(staging + "/runtime", { recursive: true });
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
  };
  await writeFile(staging + "/runtime/vm.js", vm.outputFiles[0].text);
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
  const loader =
    'const script=document.createElement("script");script.src=new URL("./frame.js",location.href).href;document.head.append(script);';
  const hash = createHash("sha256").update(loader).digest("base64");
  const csp = `default-src 'none'; script-src 'sha256-${hash}' 'strict-dynamic' 'wasm-unsafe-eval'; style-src 'unsafe-inline'; worker-src blob:; child-src blob:; connect-src 'none'; img-src data:; font-src data:; base-uri 'none'; form-action 'none'; object-src 'none'`;
  await writeFile(
    staging + "/runtime/frame.html",
    `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="referrer" content="no-referrer"><style>${css.replaceAll("</style", "<\\/style")}</style></head><body style="margin:0"><div id="root"></div><script>${loader}</script></body></html>`,
  );
  await build({
    ...options,
    write: true,
    format: "esm",
    splitting: true,
    entryPoints: ["src/index.ts", "src/ui.ts"],
    outdir: staging,
    external: Object.keys(
      JSON.parse(await readFile("package.json", "utf8")).dependencies,
    ).concat(["react", "react-dom", "react/jsx-runtime"]),
    define,
    banner: { js: '"use client";' },
  });
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
  await publishDirectory(staging, "dist");
} finally {
  await rm(staging, { recursive: true, force: true });
}
