import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  agentSpec,
  agentSpecExamples,
  agentSpecFull,
} from "@snackbit/opendil/agent-spec";
import {
  MANIFEST,
  publishDirectory,
  pruneUnlisted,
} from "../../packages/opendil/bin/publish-directory.mjs";

const cli = "packages/opendil/bin/opendil.mjs";
const runtime = "packages/opendil/dist/runtime";
const scratch: string[] = [];
function directory() {
  const path = mkdtempSync(join(tmpdir(), "opendil-package-"));
  scratch.push(path);
  return path;
}
afterEach(() => {
  for (const path of scratch.splice(0))
    rmSync(path, { recursive: true, force: true });
});
function opendil(...args: string[]) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    encoding: "utf8",
  });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}
function sha256(content: string) {
  return createHash("sha256").update(content).digest("hex");
}
function manifest(path: string) {
  return JSON.parse(readFileSync(join(path, MANIFEST), "utf8")) as {
    package?: string;
    version?: string;
    files: Record<string, string>;
  };
}
function write(path: string, files: Record<string, string>) {
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(join(path, file, ".."), { recursive: true });
    writeFileSync(join(path, file), content);
  }
}

describe("agent spec entry", () => {
  it("exports the canonical spec/ Markdown of this build", () => {
    expect(agentSpec).toBe(readFileSync("spec/genui.agent.md", "utf8"));
    expect(agentSpecFull).toBe(
      readFileSync("spec/genui.agent.full.md", "utf8"),
    );
    expect(agentSpecExamples).toBe(
      readFileSync("spec/genui.examples.md", "utf8"),
    );
    for (const file of [
      "genui.agent.md",
      "genui.agent.full.md",
      "genui.examples.md",
    ])
      expect(readFileSync("packages/opendil/dist/spec/" + file, "utf8")).toBe(
        readFileSync("spec/" + file, "utf8"),
      );
  });
  it("loads in any runtime and stays out of the renderer entries", () => {
    const entry = readFileSync("packages/opendil/dist/agent-spec.js", "utf8");
    // Spec strings are escaped onto single lines, so line starts are module code.
    // No imports or client directive: safe for edge and server code.
    expect(entry).not.toMatch(
      /^\s*(?:import\b|export\b.*\bfrom\b|"use client")/m,
    );
    expect(entry).toMatch(/^export \{/m);
    for (const file of ["index.js", "ui.js"])
      expect(
        readFileSync("packages/opendil/dist/" + file, "utf8"),
      ).not.toContain("# GenUI Agent Specification");
  });
});

describe("opendil CLI", () => {
  it("prints usage for help flags and exits successfully", () => {
    for (const args of [["--help"], ["-h"], ["copy-assets", "--help"]]) {
      const result = opendil(...args);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain(
        "Usage: opendil copy-assets --out <public-directory>",
      );
    }
  });
  it("rejects incomplete or unknown arguments with usage", () => {
    const out = directory();
    for (const args of [
      [],
      ["copy-assets"],
      ["copy-assets", "--out"],
      ["copy-assets", "--out="],
      ["copy-assets", "--out", out, "--out", out],
      ["copy-assets", "--out", out, "--force"],
      ["copy", "--out", out],
    ]) {
      const result = opendil(...args);
      expect(result.code, args.join(" ")).toBe(1);
      expect(result.stderr).toContain("Usage: opendil");
    }
    expect(readdirSync(out)).toEqual([]);
  });
  it("copies only the iframe runtime with either --out form and summarizes it", () => {
    const { version } = JSON.parse(
      readFileSync("packages/opendil/package.json", "utf8"),
    ) as { version: string };
    for (const flag of ["--out", "--out="]) {
      const out = join(directory(), "public", "opendil");
      const args = flag === "--out" ? [flag, out] : [flag + out];
      const result = opendil("copy-assets", ...args);
      expect(result.code).toBe(0);
      expect(result.stdout).toMatch(
        new RegExp(
          `^Copied 2 files \\([\\d.]+ MB\\) from @snackbit/opendil@${version.replaceAll(".", "\\.")} to ${out}\\n$`,
        ),
      );
      expect(readdirSync(out).sort()).toEqual([
        MANIFEST,
        "frame.html",
        "frame.js",
      ]);
      expect(manifest(out)).toEqual({
        package: "@snackbit/opendil",
        version,
        files: {
          "frame.html": sha256(
            readFileSync(join(runtime, "frame.html"), "utf8"),
          ),
          "frame.js": sha256(readFileSync(join(runtime, "frame.js"), "utf8")),
        },
      });
    }
  });
  it("removes only unchanged files that an earlier copy wrote", () => {
    const parent = directory();
    const out = join(parent, "opendil");
    write(parent, { "outside.txt": "keep" });
    write(out, {
      "vm.js": "old runtime",
      "edited.js": "changed by the user",
      "user.txt": "not from the CLI",
    });
    writeFileSync(
      join(out, MANIFEST),
      JSON.stringify({
        files: {
          "vm.js": sha256("old runtime"),
          "edited.js": sha256("as copied"),
          "../outside.txt": sha256("keep"),
          "missing.js": sha256("gone"),
        },
      }),
    );
    const result = opendil("copy-assets", "--out", out);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain(
      "Removed 1 file left by an earlier copy: vm.js",
    );
    expect(result.stdout).toContain(
      "Kept 1 file from an earlier copy that changed since: edited.js",
    );
    expect(readdirSync(out).sort()).toEqual([
      MANIFEST,
      "edited.js",
      "frame.html",
      "frame.js",
      "user.txt",
    ]);
    expect(readFileSync(join(parent, "outside.txt"), "utf8")).toBe("keep");
    expect(Object.keys(manifest(out).files)).toEqual([
      "frame.html",
      "frame.js",
    ]);
  });
  it("never removes files through symlinked directories or backslash paths", () => {
    const parent = directory();
    const out = join(parent, "opendil");
    write(parent, { "outside/victim.txt": "victim", "outside.txt": "keep" });
    // A backslash is an ordinary name character on POSIX, so this file sits inside out.
    write(out, { "nested\\file.txt": "copied" });
    symlinkSync(join(parent, "outside"), join(out, "link"), "dir");
    writeFileSync(
      join(out, MANIFEST),
      JSON.stringify({
        files: {
          "link/victim.txt": sha256("victim"),
          "..\\outside.txt": sha256("keep"),
          "nested\\file.txt": sha256("copied"),
        },
      }),
    );
    const result = opendil("copy-assets", "--out", out);
    expect(result.code).toBe(0);
    expect(result.stdout).not.toContain("Removed");
    expect(readFileSync(join(parent, "outside/victim.txt"), "utf8")).toBe(
      "victim",
    );
    expect(readFileSync(join(parent, "outside.txt"), "utf8")).toBe("keep");
    expect(readFileSync(join(out, "nested\\file.txt"), "utf8")).toBe("copied");
  });
  it("removes listed files from real subdirectories of the destination", async () => {
    const source = directory();
    const out = directory();
    write(source, { "a.js": "a", "sub/old.js": "old" });
    await publishDirectory(source, out);
    rmSync(join(source, "sub"), { recursive: true });
    const result = await publishDirectory(source, out, { removeStale: true });
    expect(result.removed).toEqual(["sub/old.js"]);
    expect(existsSync(join(out, "sub/old.js"))).toBe(false);
  });
  it("treats an unreadable manifest as listing nothing", () => {
    const out = directory();
    write(out, { "vm.js": "old", [MANIFEST]: "{not json" });
    expect(opendil("copy-assets", "--out", out).code).toBe(0);
    expect(existsSync(join(out, "vm.js"))).toBe(true);
  });
});

describe("build output publication", () => {
  it("keeps earlier files during rebuilds and prunes them for packing", async () => {
    const out = directory();
    const first = directory();
    const second = directory();
    write(first, { "index.js": "a", "chunk-A.js": "a", "types/a.d.ts": "a" });
    write(second, { "index.js": "b", "chunk-B.js": "b", "types/b.d.ts": "b" });
    await publishDirectory(first, out);
    const result = await publishDirectory(second, out);
    expect(result).toMatchObject({ bytes: 3, removed: [], kept: [] });
    // A page that loaded the first build can still fetch its chunks.
    expect(readFileSync(join(out, "chunk-A.js"), "utf8")).toBe("a");
    expect((await pruneUnlisted(out)).sort()).toEqual([
      "chunk-A.js",
      "types/a.d.ts",
    ]);
    expect(readdirSync(out).sort()).toEqual([
      MANIFEST,
      "chunk-B.js",
      "index.js",
      "types",
    ]);
    expect(readdirSync(join(out, "types"))).toEqual(["b.d.ts"]);
  });
  it("refuses to prune a directory without a manifest", async () => {
    const out = directory();
    write(out, { "index.js": "a" });
    await expect(pruneUnlisted(out)).rejects.toThrow("No publish manifest");
    expect(readdirSync(out)).toEqual(["index.js"]);
  });
});
