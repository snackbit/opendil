#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { publishDirectory } from "./publish-directory.mjs";
const [command, flag, destination, ...extra] = process.argv.slice(2);
if (
  command !== "copy-assets" ||
  flag !== "--out" ||
  !destination ||
  extra.length
) {
  console.error("Usage: opendil copy-assets --out <public-directory>");
  process.exitCode = 1;
} else {
  const output = resolve(destination);
  await publishDirectory(
    fileURLToPath(new URL("../dist/runtime/", import.meta.url)),
    output,
  );
}
