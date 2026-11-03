import { mkdir, readdir, copyFile, rename, rm } from "node:fs/promises";
import { join, dirname } from "node:path";
import { randomUUID } from "node:crypto";

/** Publish complete files without removing paths used by an active dev server. */
export async function publishDirectory(source, destination) {
  const files = [];
  async function collect(relative = "") {
    for (const entry of await readdir(join(source, relative), {
      withFileTypes: true,
    })) {
      const file = join(relative, entry.name);
      if (entry.isDirectory()) await collect(file);
      else files.push(file);
    }
  }
  await collect();
  const priority = (file) =>
    /(?:^|\/)(?:index\.js|ui\.js|frame\.html)$/.test(file) ? 1 : 0;
  files.sort((a, b) => priority(a) - priority(b));
  for (const file of files) {
    const target = join(destination, file);
    await mkdir(dirname(target), { recursive: true });
    const temporary = target + "." + randomUUID() + ".tmp";
    try {
      await copyFile(join(source, file), temporary);
      await rename(temporary, target);
    } finally {
      await rm(temporary, { force: true });
    }
  }
}
