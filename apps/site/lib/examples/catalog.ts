/**
 * Example metadata shared by /demo/<example>/, the example pickers, the landing page and <LiveExample>.
 * Sources live in sources.ts (server) and generated.ts (client) so this module stays small.
 */
export const exampleIds = [
  "release-planner",
  "service-console",
  "team-budget",
  "deployment",
  "pricing",
  "form",
  "tabs",
  "charts",
  "graph",
  "table",
  "code",
  "media",
  "overlays",
  "mermaid",
  "vector",
  "layout",
  "status",
  "showcase",
  "large",
  "list",
  "long-table",
  "isolation",
  "customization",
] as const;

export type ExampleId = (typeof exampleIds)[number];

export interface ExampleDefinition {
  id: ExampleId;
  title: string;
  description: string;
  group: "Patterns" | "Components" | "Advanced";
  image?: "pricing" | "charts" | "diagram";
}

export const examples: readonly ExampleDefinition[] = [
  {
    id: "release-planner",
    title: "Release planner",
    description: "Capacity planning, canary stages, and a preflight checklist.",
    group: "Patterns",
  },
  {
    id: "service-console",
    title: "Service console",
    description: "Metrics, topology, and an interactive incident handoff.",
    group: "Patterns",
  },
  {
    id: "team-budget",
    title: "Team budget",
    description:
      "Adjust a team, compare billing, and see the forecast respond.",
    group: "Patterns",
  },
  {
    id: "deployment",
    title: "Deployment planner",
    description:
      "Regions, replicas, and a reactive estimate. All in one document.",
    group: "Patterns",
  },
  {
    id: "pricing",
    title: "Pricing calculator",
    description: "A seat slider and billing toggle with a live total.",
    group: "Patterns",
    image: "pricing",
  },
  {
    id: "form",
    title: "Form controls",
    description: "Native input feedback with document-owned state.",
    group: "Patterns",
  },
  {
    id: "tabs",
    title: "Conditional views",
    description: "Switch between views without leaving the document.",
    group: "Patterns",
  },
  {
    id: "charts",
    title: "Charts",
    description: "Hover, inspect, and select real data series.",
    group: "Components",
    image: "charts",
  },
  {
    id: "graph",
    title: "Node graph",
    description: "Select services in an interactive architecture diagram.",
    group: "Components",
    image: "diagram",
  },
  {
    id: "table",
    title: "Data table",
    description: "Native table structure with repeated rows.",
    group: "Components",
  },
  {
    id: "code",
    title: "Code editor",
    description: "Highlighted, editable code with wrap and copy controls.",
    group: "Components",
  },
  {
    id: "media",
    title: "Media",
    description: "A carousel of offline illustrations.",
    group: "Components",
  },
  {
    id: "overlays",
    title: "Popovers",
    description: "Contextual detail with keyboard and focus behavior.",
    group: "Components",
  },
  {
    id: "mermaid",
    title: "Mermaid",
    description: "Bounded, sanitized text-to-diagram rendering.",
    group: "Components",
  },
  {
    id: "vector",
    title: "SVG",
    description: "Compose a vector graphic in the document.",
    group: "Components",
  },
  {
    id: "layout",
    title: "Layout",
    description: "Grid and flex composition with a small styling vocabulary.",
    group: "Components",
  },
  {
    id: "status",
    title: "Text and status",
    description: "Semantic labels and document typography.",
    group: "Components",
  },
  {
    id: "showcase",
    title: "Showcase",
    description:
      "The original interactive showcase: analytics, pricing, controls, media, and code.",
    group: "Advanced",
  },
  {
    id: "large",
    title: "Large document",
    description: "Five thousand independently interactive cards.",
    group: "Advanced",
  },
  {
    id: "list",
    title: "Long list",
    description: "A repeated template with five thousand entries.",
    group: "Advanced",
  },
  {
    id: "long-table",
    title: "Long table",
    description: "Virtualized native table rows.",
    group: "Advanced",
  },
  {
    id: "isolation",
    title: "Isolation",
    description: "Resource limits and independent message boundaries.",
    group: "Advanced",
  },
  {
    id: "customization",
    title: "Customization",
    description: "Your components, configuration, and theme.",
    group: "Advanced",
  },
];

export function isExampleId(value: string): value is ExampleId {
  return (exampleIds as readonly string[]).includes(value);
}

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
