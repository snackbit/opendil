export function extractApi(): {
  api: Map<string, Set<string>>;
  layout: Set<string>;
  svgProps: Set<string>;
};
export function documentedApi(
  markdown: string,
  layout: Set<string>,
  svgProps?: Set<string>,
): Map<string, Set<string>>;
export function sharedProps(markdown: string, name: string): Set<string>;
export function executableExamples(
  markdown: string,
  file: string,
): { name: string; source: string }[];
export function compareApi(
  actual: Map<string, Set<string>>,
  documented: Map<string, Set<string>>,
): string[];
export function compositionErrors(
  nodes: import("../packages/opendil/src/dil/parser/types").DilNode[],
  links: { parent: number; child: number }[],
  markdown: string,
): string[];
