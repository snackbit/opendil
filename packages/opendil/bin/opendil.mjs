#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MANIFEST, publishDirectory } from "./publish-directory.mjs";

const usage = `Usage: opendil copy-assets --out <public-directory>

Copies the iframe runtime (frame.html, frame.js) into a directory your app
serves, such as public/opendil. Serve it at the renderer's runtimeBaseUrl
(default /opendil/). Only the default iframe mode needs these files.

Options:
  --out <dir>, --out=<dir>  Destination directory (created if missing)
  -h, --help                Show this help

Each copy writes ${MANIFEST} into the destination. The next copy uses it to
remove runtime files that an earlier version wrote and this version no longer
ships. Files the manifest does not list, or that changed since, are kept.`;

function parse(args) {
  if (args.some((arg) => arg === "-h" || arg === "--help"))
    return { help: true };
  const [command, ...rest] = args;
  if (command !== "copy-assets") return {};
  let out;
  for (let index = 0; index < rest.length; index++) {
    const arg = rest[index];
    if (out !== undefined) return {};
    if (arg === "--out") out = rest[++index];
    else if (arg.startsWith("--out=")) out = arg.slice("--out=".length);
    else return {};
  }
  return out ? { out } : {};
}

function size(bytes) {
  return bytes >= 1024 * 1024
    ? (bytes / 1024 / 1024).toFixed(1) + " MB"
    : (bytes / 1024).toFixed(1) + " kB";
}

const options = parse(process.argv.slice(2));
if (options.help) console.log(usage);
else if (!options.out) {
  console.error(usage);
  process.exitCode = 1;
} else {
  const output = resolve(options.out);
  const { name, version } = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );
  const result = await publishDirectory(
    fileURLToPath(new URL("../dist/runtime/", import.meta.url)),
    output,
    {
      // Development builds can leave older files in dist/runtime; copy only the runtime.
      files: ["frame.html", "frame.js"],
      removeStale: true,
      metadata: { package: name, version },
    },
  );
  const plural = (count) => count + (count === 1 ? " file" : " files");
  console.log(
    `Copied ${plural(result.files.length)} (${size(result.bytes)}) from ${name}@${version} to ${output}`,
  );
  if (result.removed.length)
    console.log(
      `Removed ${plural(result.removed.length)} left by an earlier copy: ${result.removed.join(", ")}`,
    );
  if (result.kept.length)
    console.log(
      `Kept ${plural(result.kept.length)} from an earlier copy that changed since: ${result.kept.join(", ")}`,
    );
}
