import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
const files = (await readdir(".tmp/release")).filter((name) =>
  name.endsWith(".tgz"),
);
if (files.length !== 1)
  throw new Error("Expected exactly one verified package tarball");
const archive = resolve(".tmp/release", files[0]);
const manifest = JSON.parse(
  execFileSync("tar", ["-xOf", archive, "package/package.json"], {
    encoding: "utf8",
  }),
);
if (
  manifest.name !== "@snackbit/opendil" ||
  !/^\d+\.\d+\.\d+$/.test(manifest.version)
)
  throw new Error("Unexpected release package or version");
let exists = false;
try {
  execFileSync(
    "npm",
    [
      "view",
      manifest.name + "@" + manifest.version,
      "version",
      "--registry=https://registry.npmjs.org",
    ],
    { stdio: "pipe" },
  );
  exists = true;
} catch (error) {
  if (!String(error.stderr).includes("E404")) throw error;
}
if (exists) console.log("Version already published: " + manifest.version);
else
  execFileSync(
    "npm",
    [
      "publish",
      archive,
      "--access",
      "public",
      "--provenance",
      "--ignore-scripts",
      "--registry=https://registry.npmjs.org",
    ],
    { stdio: "inherit" },
  );
// Create the release separately so a version published outside this run still gets one.
const tag = "v" + manifest.version;
let released = false;
try {
  execFileSync("gh", ["release", "view", tag], { stdio: "pipe" });
  released = true;
} catch (error) {
  if (!String(error.stderr).includes("release not found")) throw error;
}
if (released) console.log("GitHub release already exists: " + tag);
else
  execFileSync(
    "gh",
    [
      "release",
      "create",
      tag,
      "--target",
      process.env.GITHUB_SHA,
      "--title",
      "OpenDIL " + manifest.version,
      "--notes",
      "Published @snackbit/opendil@" +
        manifest.version +
        "." +
        (existsSync("packages/opendil/CHANGELOG.md")
          ? " See packages/opendil/CHANGELOG.md for changes."
          : ""),
    ],
    { stdio: "inherit" },
  );
