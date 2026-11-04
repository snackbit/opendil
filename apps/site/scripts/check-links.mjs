#!/usr/bin/env node
/**
 * Validates every link in the site's docs content (content/docs) with
 * next-validate-link, without a build. Run it with `npm run check:links`.
 *
 * Valid targets are the docs pages (with their heading anchors), the App Router
 * pages and static route handlers, the `.md` rewrites of docs pages, files in
 * public/, and temporary redirects such as /demo/. Content links absolute
 * /docs/... paths; the base path is added at build time, so links never contain
 * it. A link to a permanent redirect source fails with the URL to link instead.
 */
import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { remarkHeading } from "fumadocs-core/mdx-plugins/remark-heading";
import { printErrors, scanURLs, validateFiles } from "next-validate-link";
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import remarkMdx from "remark-mdx";
import { redirects } from "../redirects.ts";

const site = fileURLToPath(new URL("..", import.meta.url));
const root = join(site, "../..");
const contentDir = join(site, "content/docs");
const specDir = join(root, "spec");

/** MDX components whose attributes hold links. */
const linkComponents = {
  Card: { attributes: ["href"] },
  a: { attributes: ["href"] },
  Link: { attributes: ["href"] },
};

async function listFiles(directory, pattern) {
  const files = [];
  for (const entry of await readdir(directory, {
    withFileTypes: true,
    recursive: true,
  })) {
    if (entry.isFile() && pattern.test(entry.name))
      files.push(join(entry.parentPath, entry.name));
  }
  return files.sort();
}

/** Blanks YAML frontmatter while keeping line numbers for error positions. */
function stripFrontmatter(content) {
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n/.exec(content);
  return match
    ? match[0].replace(/[^\n]/g, "") + content.slice(match[0].length)
    : content;
}

/** Fumadocs slugs: path below content/docs, without (group) folders and a trailing index. */
function slugsOf(file) {
  const parts = relative(contentDir, file)
    .replace(/\.mdx?$/, "")
    .split(sep)
    .filter((part) => !/^\(.+\)$/.test(part));
  if (parts.at(-1) === "index") parts.pop();
  return parts;
}

const mdxProcessor = remark().use(remarkMdx).use(remarkGfm).use(remarkHeading);
const mdProcessor = remark().use(remarkGfm).use(remarkHeading);

/** Heading anchors exactly as Fumadocs generates them (remarkHeading). */
async function headingIds(content, processor) {
  const file = await processor.process({ value: content });
  return (file.data.toc ?? []).map((entry) => entry.url.slice(1));
}

/** Links must be absolute paths, fragments, or external URLs; relative links break under trailing slashes. */
function relativeLinks(tree) {
  const found = [];
  const check = (href, node) => {
    if (typeof href === "string" && !/^(?:\/|#|[a-z][a-z+.-]*:)/i.test(href))
      found.push({
        url: href,
        line: node.position?.start.line ?? 0,
        column: node.position?.start.column ?? 0,
        reason: new Error("Use an absolute /docs/... path"),
      });
  };
  const walk = (node) => {
    if (node.type === "link" || node.type === "definition")
      check(node.url, node);
    if (
      (node.type === "mdxJsxFlowElement" ||
        node.type === "mdxJsxTextElement") &&
      node.name in linkComponents
    )
      for (const attribute of node.attributes)
        if (linkComponents[node.name].attributes.includes(attribute.name))
          check(attribute.value, node);
    for (const child of node.children ?? []) walk(child);
  };
  walk(tree);
  return found;
}

/** Paths of App Router route handlers without dynamic segments, such as /llms.txt. */
async function staticRouteHandlers() {
  const appDir = join(site, "app");
  return (await listFiles(appDir, /^route\.(?:ts|tsx|js|mjs)$/))
    .map((file) =>
      relative(appDir, file)
        .split(sep)
        .slice(0, -1)
        .filter((part) => !/^\(.+\)$/.test(part)),
    )
    .filter((parts) => !parts.some((part) => part.startsWith("[")))
    .map((parts) => "/" + parts.join("/"));
}

async function publicFiles() {
  const publicDir = join(site, "public");
  try {
    return (await listFiles(publicDir, /./)).map(
      (file) => "/" + relative(publicDir, file).split(sep).join("/"),
    );
  } catch {
    return [];
  }
}

const sourceFiles = await listFiles(contentDir, /\.mdx?$/);
const pages = await Promise.all(
  sourceFiles.map(async (file) => {
    const content = stripFrontmatter(await readFile(file, "utf8"));
    const processor = file.endsWith(".mdx") ? mdxProcessor : mdProcessor;
    const hashes = await headingIds(content, processor);
    // <SpecDocument file="..."/> renders a spec file, so its headings are anchors of this page too.
    for (const [, name] of content.matchAll(/<SpecDocument\s+file="([^"]+)"/g))
      hashes.push(
        ...(await headingIds(
          await readFile(join(specDir, name), "utf8"),
          mdProcessor,
        )),
      );
    const tree = processor.parse(content);
    const slugs = slugsOf(file);
    return {
      file,
      content,
      slugs,
      hashes,
      url: "/docs" + slugs.map((slug) => "/" + slug).join(""),
      relative: relativeLinks(tree),
    };
  }),
);

const scanned = await scanURLs({
  preset: "next",
  cwd: site,
  populate: {
    "docs/[[...slug]]": pages.map((page) => ({
      value: page.slugs,
      hashes: page.hashes,
    })),
  },
});
const extra = [
  ...(await staticRouteHandlers()),
  ...(await publicFiles()),
  ...pages.map((page) => page.url + ".md"),
  ...redirects
    .filter((redirect) => !redirect.permanent)
    .map((redirect) => redirect.source),
];
for (const url of extra) scanned.urls.set(url.replace(/\/$/, "") || "/", {});
// The site uses trailing slashes; accept both spellings of every page URL.
for (const [url, meta] of [...scanned.urls])
  if (url !== "/" && !/\.[a-z]+$/i.test(url)) scanned.urls.set(url + "/", meta);

const permanent = new Map(
  redirects
    .filter((redirect) => redirect.permanent)
    .map((redirect) => [redirect.source.replace(/\/$/, ""), redirect]),
);
const results = await validateFiles(
  pages.map((page) => ({
    path: relative(root, page.file),
    content: page.content,
    url: page.url,
  })),
  { scanned, markdown: { components: linkComponents } },
);
for (const result of results)
  for (const error of result.errors) {
    const moved = permanent.get(error.url.split(/[?#]/)[0].replace(/\/$/, ""));
    if (error.reason === "not-found" && moved)
      error.reason = new Error(
        "Permanently redirects; link " + moved.destination,
      );
  }
for (const page of pages) {
  if (!page.relative.length) continue;
  const path = relative(root, page.file);
  const existing = results.find((result) => result.file === path);
  if (existing) existing.errors.push(...page.relative);
  else results.push({ file: path, errors: page.relative });
}

const count = results.reduce((sum, result) => sum + result.errors.length, 0);
if (count) {
  printErrors(results);
  console.error(`check-links: ${count} broken link(s) in apps/site docs.`);
  process.exitCode = 1;
} else
  console.log(
    `check-links: ${pages.length} docs pages, no broken links (${scanned.urls.size} known URLs).`,
  );
