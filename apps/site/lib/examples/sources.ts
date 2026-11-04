import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ExampleId } from "./catalog";
import * as component from "./components";
import { customizationSource } from "./customization";
import { generatedSource, isGeneratedExample } from "./generated";
import { isolationSource } from "./isolation-source";
import { deployment, form, pricing, tabs } from "./patterns";
import { releasePlanner } from "./release-planner";
import { serviceConsole } from "./service-console";
import { showcaseSource } from "./showcase-source";
import { teamBudget } from "./team-budget";

/*
 * Server-only: example sources for server components, route handlers and tests.
 * Pages pass the strings to client islands as props. Files are read with fs from the site
 * directory (Next.js runs with apps/site as the working directory, tests from the repository root).
 */
function examplesFile(name: string) {
  const site = existsSync(join(process.cwd(), "lib/examples"))
    ? process.cwd()
    : join(process.cwd(), "apps/site");
  return readFileSync(join(site, "lib/examples", name), "utf8");
}

const sources: Record<ExampleId, () => string> = {
  "release-planner": () => releasePlanner,
  "service-console": () => serviceConsole,
  "team-budget": () => teamBudget,
  deployment: () => deployment,
  pricing: () => pricing,
  form: () => form,
  tabs: () => tabs,
  charts: () => component.chart,
  graph: () => component.graph,
  table: () => component.table,
  code: () => component.code,
  media: () => component.media,
  overlays: () => component.overlays,
  mermaid: () => component.mermaid,
  vector: () => component.vector,
  layout: () => component.layout,
  status: () => component.status,
  showcase: () => showcaseSource(examplesFile("showcase.dil")),
  large: () => generatedSource("large") ?? "",
  list: () => generatedSource("list") ?? "",
  "long-table": () => generatedSource("long-table") ?? "",
  isolation: () => isolationSource,
  customization: () => customizationSource,
};

/** The full DIL source of an example. */
export function exampleSource(id: ExampleId): string {
  return sources[id]();
}

/** The source to send to the browser, or null for the scale fixtures that the browser generates. */
export function pageSource(id: ExampleId): string | null {
  return isGeneratedExample(id) ? null : exampleSource(id);
}

/** The registration module behind the customization example, shown as React source. */
export function customComponentSource(): string {
  return examplesFile("custom-components.tsx");
}
