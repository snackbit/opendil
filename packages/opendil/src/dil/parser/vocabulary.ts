// Lowercase tag names with a stock DIL meaning. The parser keeps other lowercase
// HTML-like tags in prose as text; capitalized names always parse as components.
// tests/unit/parser.test.ts keeps this list equal to the stock renderer registry.
const STOCK_TAGS = [
  "box",
  "row",
  "grid",
  "grid-item",
  "text",
  "caption",
  "title",
  "badge",
  "divider",
  "icon",
  "button",
  "pressable",
  "checkbox",
  "slider",
  "input",
  "segmented-control",
  "radio-group",
  "radio",
  "label",
  "spacer",
  "popover",
  "popover-trigger",
  "popover-content",
  "carousel",
  "carousel-item",
  "table",
  "table-row",
  "table-cell",
  // SVG elements
  "svg",
  "defs",
  "marker",
  "path",
  "rect",
  "circle",
  "line",
  "polyline",
  "polygon",
  "g",
  "ellipse",
  "tspan",
  "linearGradient",
  "stop",
];
export const TAG_NAME = /^[A-Za-z][\w-]{0,63}$/;
const MAX_CUSTOM_TAGS = 1024;

export class TagVocabulary {
  private readonly names = new Set(STOCK_TAGS);
  private custom = 0;

  static stock(): readonly string[] {
    return STOCK_TAGS;
  }

  /** Adds host-registered component names; malformed entries are ignored. */
  allow(names: unknown) {
    if (!Array.isArray(names)) return;
    for (const name of names) {
      if (this.custom >= MAX_CUSTOM_TAGS) return;
      if (typeof name !== "string" || !TAG_NAME.test(name)) continue;
      if (this.names.has(name)) continue;
      this.names.add(name);
      this.custom++;
    }
  }

  /** Capitalized names are components; lowercase names must be registered. */
  isComponent(name: string): boolean {
    return /^[A-Z]/.test(name) || this.names.has(name);
  }

  /** Whether some component name starts with this lowercase prefix. */
  startsName(prefix: string): boolean {
    for (const name of this.names) if (name.startsWith(prefix)) return true;
    return false;
  }
}
