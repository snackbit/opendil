#!/usr/bin/env node
/**
 * Copies the OpenDIL iframe runtime into public/opendil.
 *
 *   node scripts/sync-runtime.mjs                       copy once
 *   node scripts/sync-runtime.mjs --watch               copy, then re-copy whenever the package republishes
 *   node scripts/sync-runtime.mjs --watch -- <command>  same, while <command> runs; exits with it
 *
 * The package build replaces dist files atomically, so polling the two copied
 * files sees each publish without reading a half-written runtime.
 */
import { spawn } from "node:child_process";
import { unwatchFile, watchFile } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const site = fileURLToPath(new URL("..", import.meta.url));
const output = join(site, "public/opendil");
const packageRoot = dirname(
  createRequire(import.meta.url).resolve("@snackbit/opendil/package.json"),
);
const cli = join(packageRoot, "bin/opendil.mjs");
const watched = ["frame.html", "frame.js"].map((file) =>
  join(packageRoot, "dist/runtime", file),
);

const args = process.argv.slice(2);
const separator = args.indexOf("--");
const options = separator === -1 ? args : args.slice(0, separator);
const command = separator === -1 ? [] : args.slice(separator + 1);
const watch = options.includes("--watch");

function copy() {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [cli, "copy-assets", "--out", output],
      {
        stdio: "inherit",
      },
    );
    child.on("exit", (code) => resolve(code === 0));
    child.on("error", (error) => {
      console.error(error);
      resolve(false);
    });
  });
}

if (command.length && !watch) {
  console.error("[sync-runtime] A command after -- requires --watch.");
  process.exit(1);
}

if (!(await copy()) && !watch) {
  process.exit(1);
}

if (watch) {
  let copying = false;
  let pending = false;
  let timer;
  const run = async () => {
    if (copying) {
      pending = true;
      return;
    }
    copying = true;
    if (!(await copy()))
      console.error("[sync-runtime] Copy failed; waiting for the next change.");
    copying = false;
    if (pending) {
      pending = false;
      await run();
    }
  };
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(run, 300);
  };
  for (const file of watched) watchFile(file, { interval: 500 }, schedule);
  const stop = () => {
    clearTimeout(timer);
    for (const file of watched) unwatchFile(file, schedule);
  };

  if (command.length) {
    const [executable, ...rest] = command;
    const child = spawn(executable, rest, { stdio: "inherit", cwd: site });
    for (const signal of ["SIGINT", "SIGTERM"])
      process.on(signal, () => child.kill(signal));
    child.on("exit", (code, signal) => {
      stop();
      process.exitCode = code ?? (signal ? 1 : 0);
    });
  } else {
    console.log("[sync-runtime] Watching the OpenDIL runtime for changes.");
    for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, stop);
  }
}
