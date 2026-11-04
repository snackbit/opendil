import { encode } from "gpt-tokenizer/encoding/o200k_base";
import { featuredExamples } from "@/lib/examples/catalog";
import { exampleSource } from "@/lib/examples/sources";

export interface HeroExample {
  source: string;
  /** o200k token count shown next to the example name. */
  tokens: number;
}

/** Server-only: the featured examples for the landing preview, counted at build time. */
export function heroExamples(): Record<string, HeroExample> {
  return Object.fromEntries(
    featuredExamples.map((example) => {
      const source = exampleSource(example.id);
      return [example.id, { source, tokens: encode(source).length }];
    }),
  );
}
