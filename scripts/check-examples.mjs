// Installs each example in examples/ against a freshly packed @snackbit/opendil
// and runs its typecheck and production build. Work happens in .tmp/examples/.
import { execFileSync } from "node:child_process";
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const work = join(root, ".tmp", "examples");
const started = performance.now();
const seconds = (since) =>
  ((performance.now() - since) / 1000).toFixed(1) + " s";

function run(command, args, cwd = root) {
  const at = performance.now();
  console.log(`$ ${command} ${args.join(" ")}  (${cwd.replace(root, ".")})`);
  execFileSync(command, args, { cwd, stdio: "inherit" });
  console.log(`  done in ${seconds(at)}`);
}

await rm(work, { recursive: true, force: true });
await mkdir(work, { recursive: true });

run("npm", ["run", "build:package"]);
run("npm", ["pack", "-w", "@snackbit/opendil", "--pack-destination", work]);
const tarball = (await readdir(work)).find((name) => name.endsWith(".tgz"));
if (!tarball) throw new Error("npm pack wrote no tarball");

const examples = (
  await readdir(join(root, "examples"), { withFileTypes: true })
).filter((entry) => entry.isDirectory());
const failures = [];

for (const { name } of examples) {
  const at = performance.now();
  const dir = join(work, name);
  await cp(join(root, "examples", name), dir, {
    recursive: true,
    filter: (source) =>
      !/[\\/](node_modules|\.next|dist|public[\\/]opendil)$/.test(source),
  });
  // Point the published version range at the local tarball.
  const manifestPath = join(dir, "package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.dependencies["@snackbit/opendil"] = `file:../${tarball}`;
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  try {
    run("npm", ["install", "--no-audit", "--no-fund"], dir);
    run("npm", ["run", "typecheck"], dir);
    run("npm", ["run", "build"], dir);
    console.log(`${name}: passed in ${seconds(at)}`);
  } catch {
    failures.push(name);
    console.error(`${name}: failed after ${seconds(at)}`);
  }
}

console.log(`check-examples finished in ${seconds(started)}`);
if (failures.length) {
  console.error(`Failed examples: ${failures.join(", ")}`);
  process.exitCode = 1;
}
