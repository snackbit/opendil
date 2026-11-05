import { packOffsets } from "@/components/playback/replay-delivery";
import { tokenOffsets } from "@/components/playback/token-index";
import { featuredExamples } from "@/lib/examples/catalog";
import { exampleSource } from "@/lib/examples/sources";

export interface HeroExample {
  source: string;
  /** o200k token count shown next to the example name. */
  tokens: number;
  /** packOffsets() of the o200k token offsets, so the landing replay needs no tokenizer worker. */
  offsets: string;
}

/** Server-only: the featured examples for the landing preview, tokenized at build time. */
export function heroExamples(): Record<string, HeroExample> {
  return Object.fromEntries(
    featuredExamples.map((example) => {
      const source = exampleSource(example.id);
      const offsets = tokenOffsets(source);
      return [
        example.id,
        { source, tokens: offsets.length - 1, offsets: packOffsets(offsets) },
      ];
    }),
  );
}
