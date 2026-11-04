import { largeSource, repeatedSource } from "./large-source";

/*
 * The scale fixtures are megabytes long, so pages send no source for them and the browser builds it.
 * Every other example's source comes from sources.ts.
 */
const generators: Record<string, () => string> = {
  large: () => largeSource(),
  list: () => repeatedSource(),
  "long-table": () => repeatedSource(true),
};

export function isGeneratedExample(id: string): boolean {
  return Object.hasOwn(generators, id);
}

export function generatedSource(id: string): string | undefined {
  return isGeneratedExample(id) ? generators[id]?.() : undefined;
}
