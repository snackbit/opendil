import { expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/*
 * apps/site serves the iframe runtime as public files. scripts/sync-runtime.mjs copies them from
 * the built package before `next build` and keeps them current around `next dev`.
 */
const site = resolve("apps/site");
const script = join(site, "scripts/sync-runtime.mjs");
const runtime = resolve("packages/opendil/dist/runtime");

function sync(...args) {
  return spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8",
    timeout: 60_000,
  });
}

it("refuses to run a command without --watch", () => {
  const scratch = mkdtempSync(join(tmpdir(), "opendil-sync-"));
  try {
    const marker = join(scratch, "ran");
    const result = sync(
      "--",
      process.execPath,
      "-e",
      `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "")`,
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("A command after -- requires --watch.");
    expect(existsSync(marker)).toBe(false);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

it("copies the runtime, runs the command in the site, and exits with its code", () => {
  const scratch = mkdtempSync(join(tmpdir(), "opendil-sync-"));
  try {
    const marker = join(scratch, "cwd");
    const result = sync(
      "--watch",
      "--",
      process.execPath,
      "-e",
      `require("node:fs").writeFileSync(${JSON.stringify(marker)}, process.cwd()); process.exit(3)`,
    );
    expect(result.stderr).toBe("");
    expect(result.status).toBe(3);
    expect(readFileSync(marker, "utf8")).toBe(site);
    for (const file of ["frame.html", "frame.js"])
      expect(
        readFileSync(join(site, "public/opendil", file)).equals(
          readFileSync(join(runtime, file)),
        ),
        file,
      ).toBe(true);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});
