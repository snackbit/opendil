import { deployment, pricing, form, tabs } from "./patterns";
import * as component from "./components";
import raw from "../showcase.dil?raw";
import { showcaseSource } from "../showcase-source";
import { largeSource, repeatedSource } from "../large-source";
import { isolationSource } from "../isolation-source";
import { customizationSource } from "./customization";
import { teamBudget } from "./team-budget";
import { releasePlanner } from "./release-planner";
import { serviceConsole } from "./service-console";
export interface ExampleDefinition {
  id: string;
  title: string;
  description: string;
  group: "Patterns" | "Components" | "Advanced";
  source: () => string;
  image?: "pricing" | "charts" | "diagram";
}
export const examples: readonly ExampleDefinition[] = [
  {
    id: "release-planner",
    title: "Release planner",
    description: "Capacity planning, canary stages, and a preflight checklist.",
    group: "Patterns",
    source: () => releasePlanner,
  },
  {
    id: "service-console",
    title: "Service console",
    description: "Metrics, topology, and an interactive incident handoff.",
    group: "Patterns",
    source: () => serviceConsole,
  },
  {
    id: "team-budget",
    title: "Team budget",
    description:
      "Adjust a team, compare billing, and see the forecast respond.",
    group: "Patterns",
    source: () => teamBudget,
  },
  {
    id: "deployment",
    title: "Deployment planner",
    description:
      "Regions, replicas, and a reactive estimate. All in one document.",
    group: "Patterns",
    source: () => deployment,
  },
  {
    id: "pricing",
    title: "Pricing calculator",
    description: "A seat slider and billing toggle with a live total.",
    group: "Patterns",
    source: () => pricing,
    image: "pricing",
  },
  {
    id: "form",
    title: "Form controls",
    description: "Native input feedback with document-owned state.",
    group: "Patterns",
    source: () => form,
  },
  {
    id: "tabs",
    title: "Conditional views",
    description: "Switch between views without leaving the document.",
    group: "Patterns",
    source: () => tabs,
  },
  {
    id: "charts",
    title: "Charts",
    description: "Hover, inspect, and select real data series.",
    group: "Components",
    source: () => component.chart,
    image: "charts",
  },
  {
    id: "graph",
    title: "Node graph",
    description: "Select services in an interactive architecture diagram.",
    group: "Components",
    source: () => component.graph,
    image: "diagram",
  },
  {
    id: "table",
    title: "Data table",
    description: "Native table structure with repeated rows.",
    group: "Components",
    source: () => component.table,
  },
  {
    id: "code",
    title: "Code editor",
    description: "Highlighted, editable code with wrap and copy controls.",
    group: "Components",
    source: () => component.code,
  },
  {
    id: "media",
    title: "Media",
    description: "A carousel of offline illustrations.",
    group: "Components",
    source: () => component.media,
  },
  {
    id: "overlays",
    title: "Popovers",
    description: "Contextual detail with keyboard and focus behavior.",
    group: "Components",
    source: () => component.overlays,
  },
  {
    id: "mermaid",
    title: "Mermaid",
    description: "Bounded, sanitized text-to-diagram rendering.",
    group: "Components",
    source: () => component.mermaid,
  },
  {
    id: "vector",
    title: "SVG",
    description: "Compose a vector graphic in the document.",
    group: "Components",
    source: () => component.vector,
  },
  {
    id: "layout",
    title: "Layout",
    description: "Grid and flex composition with a small styling vocabulary.",
    group: "Components",
    source: () => component.layout,
  },
  {
    id: "status",
    title: "Text and status",
    description: "Semantic labels and document typography.",
    group: "Components",
    source: () => component.status,
  },
  {
    id: "showcase",
    title: "Showcase",
    description:
      "The original interactive showcase: analytics, pricing, controls, media, and code.",
    group: "Advanced",
    source: () => showcaseSource(raw),
  },
  {
    id: "large",
    title: "Large document",
    description: "Five thousand independently interactive cards.",
    group: "Advanced",
    source: largeSource,
  },
  {
    id: "list",
    title: "Long list",
    description: "A repeated template with five thousand entries.",
    group: "Advanced",
    source: repeatedSource,
  },
  {
    id: "long-table",
    title: "Long table",
    description: "Virtualized native table rows.",
    group: "Advanced",
    source: () => repeatedSource(true),
  },
  {
    id: "isolation",
    title: "Isolation",
    description: "Resource limits and independent message boundaries.",
    group: "Advanced",
    source: () => isolationSource,
  },
  {
    id: "customization",
    title: "Customization",
    description: "Your components, configuration, and theme.",
    group: "Advanced",
    source: () => customizationSource,
  },
];
export function exampleById(id: string): ExampleDefinition {
  const example = examples.find((example) => example.id === id);
  if (!example) throw new Error("Unknown example: " + id);
  return example;
}
export const featuredExamples = [
  "team-budget",
  "release-planner",
  "service-console",
  "showcase",
].map(exampleById);
