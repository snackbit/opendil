import {
  mkdir,
  readdir,
  readFile,
  copyFile,
  rename,
  rm,
  lstat,
  realpath,
  writeFile,
} from "node:fs/promises";
import { join, dirname, isAbsolute, normalize, sep } from "node:path";
import { randomUUID, createHash } from "node:crypto";

/** Lists every published file in a directory written by publishDirectory. */
export const MANIFEST = ".opendil-manifest.json";

/** Returns the relative paths of all files below a directory, using "/" separators. */
export async function listFiles(directory) {
  const files = [];
  async function collect(relative) {
    for (const entry of await readdir(join(directory, relative), {
      withFileTypes: true,
    })) {
      const file = relative ? relative + "/" + entry.name : entry.name;
      if (entry.isDirectory()) await collect(file);
      else files.push(file);
    }
  }
  await collect("");
  return files.sort();
}

function hash(content) {
  return createHash("sha256").update(content).digest("hex");
}

async function replaceFile(target, write) {
  await mkdir(dirname(target), { recursive: true });
  const temporary = target + "." + randomUUID() + ".tmp";
  try {
    await write(temporary);
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
}

/**
 * Accepts only plain relative paths with "/" separators. Backslashes and colons
 * are rejected so Windows cannot read an entry as a traversal or drive path.
 */
function isContainedPath(file) {
  return (
    typeof file === "string" &&
    file !== "" &&
    !/[\\:]/.test(file) &&
    !isAbsolute(file) &&
    normalize(file) === file.split("/").join(sep) &&
    !file.split("/").some((part) => part === ".." || part === ".")
  );
}

/** Resolves symlinked parent directories so a link cannot lead a removal outside root. */
async function isInsideDirectory(root, target) {
  try {
    const [base, parent] = await Promise.all([
      realpath(root),
      realpath(dirname(target)),
    ]);
    return parent === base || parent.startsWith(base + sep);
  } catch {
    return false;
  }
}

/**
 * Reads the files and hashes recorded by an earlier publish. A missing or
 * unreadable manifest yields no entries, so nothing becomes eligible for removal.
 */
export async function readManifest(directory) {
  let parsed;
  try {
    parsed = JSON.parse(await readFile(join(directory, MANIFEST), "utf8"));
  } catch {
    return new Map();
  }
  const files =
    parsed && typeof parsed.files === "object" && parsed.files
      ? parsed.files
      : {};
  return new Map(
    Object.entries(files).filter(
      ([file, hash]) =>
        isContainedPath(file) && file !== MANIFEST && typeof hash === "string",
    ),
  );
}

/**
 * Publishes complete files without removing paths used by an active dev server.
 * Copies every file below source unless files names a subset. Writes a manifest
 * of the published files and their SHA-256 hashes. With removeStale, files
 * listed in the previous manifest but absent from this publish are deleted when
 * their content is still what was published. Files the manifest does not list,
 * that changed since, or whose real path leaves destination are never touched.
 */
export async function publishDirectory(
  source,
  destination,
  { files: selected, removeStale = false, metadata = {} } = {},
) {
  const files = (selected ?? (await listFiles(source))).filter(
    (file) => file !== MANIFEST,
  );
  const previous = removeStale ? await readManifest(destination) : new Map();
  // Entry points go last so they never reference a chunk that is not yet written.
  const priority = (file) =>
    /(?:^|\/)(?:index\.js|ui\.js|frame\.html)$/.test(file) ? 1 : 0;
  const ordered = [...files].sort((a, b) => priority(a) - priority(b));
  const hashes = {};
  let bytes = 0;
  for (const file of ordered) {
    const from = join(source, file);
    const content = await readFile(from);
    hashes[file] = hash(content);
    bytes += content.length;
    await replaceFile(join(destination, file), (temporary) =>
      copyFile(from, temporary),
    );
  }
  const removed = [];
  const kept = [];
  for (const [file, recorded] of previous) {
    if (file in hashes) continue;
    const target = join(destination, file);
    if (!(await isInsideDirectory(destination, target))) continue;
    let stats;
    try {
      stats = await lstat(target);
    } catch {
      continue;
    }
    if (stats.isFile() && hash(await readFile(target)) === recorded) {
      await rm(target, { force: true });
      removed.push(file);
    } else kept.push(file);
  }
  const sorted = Object.fromEntries(
    Object.keys(hashes)
      .sort()
      .map((file) => [file, hashes[file]]),
  );
  await replaceFile(join(destination, MANIFEST), (temporary) =>
    writeFile(
      temporary,
      JSON.stringify({ ...metadata, files: sorted }, null, 2) + "\n",
    ),
  );
  return { files, bytes, removed, kept };
}

/**
 * Deletes every file below a directory that its manifest does not list. Use it
 * only for directories the publisher owns completely, such as a build output.
 */
export async function pruneUnlisted(directory) {
  const listed = await readManifest(directory);
  if (!listed.size)
    throw new Error("No publish manifest in " + directory + "; build it first");
  const removed = [];
  for (const file of await listFiles(directory)) {
    if (file === MANIFEST || listed.has(file)) continue;
    await rm(join(directory, file), { force: true });
    removed.push(file);
  }
  await removeEmptyDirectories(directory);
  return removed;
}

async function removeEmptyDirectories(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const path = join(directory, entry.name);
    await removeEmptyDirectories(path);
    if (!(await readdir(path)).length) await rm(path, { recursive: true });
  }
}
