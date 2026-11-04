import { Step, Steps } from "fumadocs-ui/components/steps";
import { Tab, Tabs } from "fumadocs-ui/components/tabs";
import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";
import { CustomizationPlayground } from "@/components/docs/customization-playground";
import { LiveExample } from "@/components/docs/live-example";
import { SourceDisclosure } from "@/components/docs/source-disclosure";

/**
 * Every component docs MDX may use; pages never import components themselves.
 * <ComponentProps>, <SpecExcerpt> and <SpecDocument> are not components: the
 * remarkDocs plugin (lib/markdown/remark-docs.ts) replaces them with Markdown
 * from the spec at build time, so search and the .md output include it.
 */
export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    Tab,
    Tabs,
    Step,
    Steps,
    LiveExample,
    CustomizationPlayground,
    SourceDisclosure,
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
