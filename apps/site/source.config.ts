import { defineConfig, defineDocs } from "fumadocs-mdx/config";
import { rehypeCodeDefaultOptions } from "fumadocs-core/mdx-plugins";
import { metaSchema, pageSchema } from "fumadocs-core/source/schema";
import { dilLanguage } from "./lib/markdown/dil-grammar";
import { remarkDocs } from "./lib/markdown/remark-docs";

export const docs = defineDocs({
  dir: "content/docs",
  docs: {
    schema: pageSchema,
    // Keeps the processed Markdown for the .md routes and llms-full.txt.
    postprocess: { includeProcessedMarkdown: true },
  },
  meta: { schema: metaSchema },
});

export default defineConfig({
  mdxOptions: {
    // First, so generated spec headings reach remark-heading, search and the TOC.
    remarkPlugins: (plugins) => [remarkDocs, ...plugins],
    rehypeCodeOptions: { ...rehypeCodeDefaultOptions, langs: [dilLanguage] },
  },
});
