import { readdir, readFile } from "node:fs/promises";
const failures = [];
async function inspect(path) {
  const entries = await readdir(path, { withFileTypes: true });
  const sources = entries.filter(
    (entry) => entry.isFile() && /\.(?:tsx?|mjs)$/.test(entry.name),
  );
  if (sources.length >= 15)
    failures.push(path + ": keep fewer than 15 direct source files");
  for (const entry of entries) {
    // Build output and generated sources (Next.js .next*, Fumadocs .source) are not authored code.
    if (
      ["dist", "node_modules", "public", ".source"].includes(entry.name) ||
      entry.name.startsWith(".next")
    )
      continue;
    const name = path + "/" + entry.name;
    if (entry.isDirectory()) await inspect(name);
    else if (
      /\.(?:tsx?|mjs)$/.test(name) &&
      (await readFile(name, "utf8")).split("\n").length > 600
    )
      failures.push(name + ": exceeds 600 physical lines");
  }
}
await inspect("packages");
await inspect("apps");
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
}
