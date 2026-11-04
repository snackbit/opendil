// Development builds keep superseded hashed chunks so pages loaded from an
// earlier build keep working. Packing removes everything the last build did not
// write, so the tarball contains exactly one build.
import { fileURLToPath } from "node:url";
import { pruneUnlisted } from "../bin/publish-directory.mjs";

const removed = await pruneUnlisted(
  fileURLToPath(new URL("../dist/", import.meta.url)),
);
console.log(
  removed.length
    ? `Removed ${removed.length} files from earlier builds in dist`
    : "dist contains only the last build",
);
